"""Base de connaissances : chargement des fiches Markdown et recherche BM25.

Chaque fiche est un fichier .md avec un en-tête YAML (titre, categorie, public,
mots_cles, acces...). Elle est découpée en sections (titres « ## ») qui sont
indexées séparément, afin de renvoyer au modèle des extraits courts et ciblés.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import yaml

PROFILS = ("particulier", "artisan", "prescripteur", "commercial")

# Mots vides français (après suppression des accents).
STOPWORDS = frozenset(
    """
    a ai aie aient aies ait as au aux avec avez avions avons c ca ce ceci cela celle celles celui
    ces cet cette ceux chez comme comment d dans de des du donc dont elle elles en encore entre est
    et etc etait ete etre eu fait faut il ils j je l la le les leur leurs lui m ma mais me meme mes
    moi mon n ne ni nos notre nous on ont ou par pas peu peut plus pour pourquoi qu quand que quel
    quelle quelles quels qui quoi s sa sans se ses si son sont sous sur t ta te tes toi ton tous tout
    toute toutes tres tu un une unes uns vos votre vous y faire quoi quel combien est-ce
    """.split()
)

TOKEN_RE = re.compile(r"[a-z0-9]+(?:[.,][0-9]+)?")
MAX_MOTS_PAR_EXTRAIT = 900


def normaliser(texte: str) -> str:
    """Minuscules sans accents (« Chènevotte » -> « chenevotte »)."""
    decompose = unicodedata.normalize("NFD", texte.lower())
    return "".join(c for c in decompose if unicodedata.category(c) != "Mn")


def _raciner(mot: str) -> str:
    """Racinisation légère : retire le pluriel et quelques suffixes fréquents."""
    for suffixe in ("ements", "ement", "ations", "ation", "iques", "ique", "ees", "ee", "es", "s", "x", "e"):
        if len(mot) - len(suffixe) >= 4 and mot.endswith(suffixe):
            return mot[: -len(suffixe)]
    return mot


def tokeniser(texte: str) -> list[str]:
    tokens = []
    for mot in TOKEN_RE.findall(normaliser(texte)):
        if mot in STOPWORDS or (len(mot) < 2 and not mot.isdigit()):
            continue
        tokens.append(_raciner(mot))
    return tokens


@dataclass
class Fiche:
    id: str  # chemin relatif, ex. "general/02-beton-de-chanvre-formulations.md"
    titre: str
    categorie: str
    public: list[str]
    mots_cles: list[str]
    acces: str  # "public" ou "interne"
    origine: str  # "general" ou "prive"
    corps: str


@dataclass
class Extrait:
    ref: str  # identifiant stable, ex. "02-beton-de-chanvre-formulations#3"
    fiche: Fiche
    section: str
    texte: str
    tokens: list[str] = field(default_factory=list, repr=False)

    @property
    def interne(self) -> bool:
        return self.fiche.acces == "interne"


@dataclass
class Resultat:
    extrait: Extrait
    score: float


def lire_fiche(chemin: Path, racine: Path) -> Fiche:
    brut = chemin.read_text(encoding="utf-8")
    meta: dict = {}
    corps = brut
    if brut.startswith("---"):
        fin = brut.find("\n---", 3)
        if fin != -1:
            meta = yaml.safe_load(brut[3:fin]) or {}
            corps = brut[fin + 4 :].lstrip("\n")

    relatif = chemin.relative_to(racine).as_posix()
    origine = relatif.split("/", 1)[0]
    titre = meta.get("titre") or _premier_titre(corps) or chemin.stem
    public = [p for p in (meta.get("public") or PROFILS) if p in PROFILS]
    # Les documents de l'entreprise sont internes sauf mention contraire.
    acces_defaut = "interne" if origine == "prive" else "public"
    acces = str(meta.get("acces") or acces_defaut).lower()
    return Fiche(
        id=relatif,
        titre=str(titre),
        categorie=str(meta.get("categorie") or "divers"),
        public=public or list(PROFILS),
        mots_cles=[str(m) for m in (meta.get("mots_cles") or [])],
        acces="interne" if acces == "interne" else "public",
        origine=origine,
        corps=corps,
    )


def _premier_titre(corps: str) -> str | None:
    m = re.search(r"^#\s+(.+)$", corps, flags=re.MULTILINE)
    return m.group(1).strip() if m else None


def decouper(fiche: Fiche) -> list[Extrait]:
    """Découpe une fiche en extraits, un par section « ## » (sous-découpés si trop longs)."""
    sections: list[tuple[str, str]] = []
    titre_courant = "Introduction"
    lignes: list[str] = []
    for ligne in fiche.corps.splitlines():
        if ligne.startswith("## "):
            sections.append((titre_courant, "\n".join(lignes)))
            titre_courant = ligne[3:].strip()
            lignes = []
        elif ligne.startswith("# ") and not sections and not any(l.strip() for l in lignes):
            continue  # titre principal déjà connu via l'en-tête
        else:
            lignes.append(ligne)
    sections.append((titre_courant, "\n".join(lignes)))

    base = Path(fiche.id).stem
    extraits: list[Extrait] = []
    for titre, texte in sections:
        texte = texte.strip()
        if not texte:
            continue
        for morceau in _sous_decouper(texte):
            ref = f"{base}#{len(extraits) + 1}"
            extraits.append(Extrait(ref=ref, fiche=fiche, section=titre, texte=morceau))
    return extraits


def _sous_decouper(texte: str) -> list[str]:
    if len(texte.split()) <= MAX_MOTS_PAR_EXTRAIT:
        return [texte]
    morceaux, courant, n = [], [], 0
    for paragraphe in re.split(r"\n\s*\n", texte):
        mots = len(paragraphe.split())
        if courant and n + mots > MAX_MOTS_PAR_EXTRAIT:
            morceaux.append("\n\n".join(courant))
            courant, n = [], 0
        courant.append(paragraphe)
        n += mots
    if courant:
        morceaux.append("\n\n".join(courant))
    return morceaux


class BaseConnaissances:
    """Index BM25 (k1=1.5, b=0.75) sur les extraits de toutes les fiches."""

    K1 = 1.5
    B = 0.75

    def __init__(self, racine: Path):
        self.racine = racine
        self.fiches: list[Fiche] = []
        self.extraits: list[Extrait] = []
        self._df: Counter[str] = Counter()
        self._tf: list[Counter[str]] = []
        self._mots_cles: dict[str, set[str]] = {}
        self._longueur_moyenne = 1.0
        self.charger()

    def charger(self) -> None:
        self.fiches = [
            lire_fiche(p, self.racine)
            for p in sorted(self.racine.glob("**/*.md"))
            if p.name.lower() != "readme.md" and "sources" not in p.relative_to(self.racine).parts
        ]
        self.extraits = [e for f in self.fiches for e in decouper(f)]
        self._mots_cles = {f.id: set(tokeniser(" ".join(f.mots_cles))) for f in self.fiches}
        self._tf, self._df = [], Counter()
        for e in self.extraits:
            # Le titre de section compte double. Les mots-clés de la fiche ne sont pas
            # recopiés dans chaque extrait (cela écraserait leur poids) : ils donnent un bonus.
            e.tokens = tokeniser(f"{e.fiche.titre} {e.section} {e.section} {e.texte}")
            tf = Counter(e.tokens)
            self._tf.append(tf)
            self._df.update(tf.keys())
        total = sum(len(e.tokens) for e in self.extraits)
        self._longueur_moyenne = total / len(self.extraits) if self.extraits else 1.0

    def rechercher(
        self,
        requete: str,
        profil: str = "particulier",
        acces_interne: bool = False,
        limite: int = 6,
    ) -> list[Resultat]:
        termes = tokeniser(requete)
        if not termes or not self.extraits:
            return []
        n = len(self.extraits)
        resultats: list[Resultat] = []
        for e, tf in zip(self.extraits, self._tf):
            if e.interne and not acces_interne:
                continue
            score = 0.0
            for t in set(termes):
                if t not in tf:
                    continue
                idf = math.log(1 + (n - self._df[t] + 0.5) / (self._df[t] + 0.5))
                f = tf[t]
                norme = 1 - self.B + self.B * len(e.tokens) / self._longueur_moyenne
                score += idf * f * (self.K1 + 1) / (f + self.K1 * norme)
            if score <= 0:
                continue
            communs = len(self._mots_cles[e.fiche.id].intersection(termes))
            score *= 1 + 0.15 * min(communs, 3)
            if profil in e.fiche.public:
                score *= 1.15
            if e.fiche.origine == "prive":
                score *= 1.1  # les documents de l'entreprise priment sur les fiches générales
            resultats.append(Resultat(e, score))
        resultats.sort(key=lambda r: r.score, reverse=True)
        return resultats[:limite]

    def resume(self, acces_interne: bool = False) -> list[dict]:
        return [
            {"id": f.id, "titre": f.titre, "categorie": f.categorie, "acces": f.acces}
            for f in self.fiches
            if acces_interne or f.acces != "interne"
        ]
