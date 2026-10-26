from pathlib import Path

from app.knowledge import BaseConnaissances, normaliser, tokeniser

RACINE_KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"


def test_normaliser_retire_accents():
    assert normaliser("Chènevotte Séchage") == "chenevotte sechage"


def test_tokeniser_ignore_mots_vides_et_pluriels():
    assert tokeniser("Les enduits de chanvre") == tokeniser("enduit chanvre")


def test_chargement_ignore_readme_et_decoupe_par_section(base):
    assert {f.id for f in base.fiches} == {"general/02-beton.md", "prive/argumentaire.md"}
    sections = [e.section for e in base.extraits if e.fiche.id == "general/02-beton.md"]
    assert sections == ["En bref", "Dosages pour un mur", "Enduits"]


def test_documents_prives_internes_par_defaut(base):
    fiche = next(f for f in base.fiches if f.origine == "prive")
    assert fiche.acces == "interne"


def test_recherche_trouve_la_bonne_section(base):
    resultats = base.rechercher("temps de séchage d'un mur", profil="artisan")
    assert resultats[0].extrait.section == "Dosages pour un mur"
    assert resultats[0].extrait.ref == "02-beton#2"


def test_recherche_exclut_les_documents_internes_sans_acces(base):
    sans = base.rechercher("objection prix trop cher", acces_interne=False)
    avec = base.rechercher("objection prix trop cher", acces_interne=True)
    assert all(not r.extrait.interne for r in sans)
    assert avec and avec[0].extrait.fiche.titre == "Argumentaire commercial"


def test_recherche_vide(base):
    assert base.rechercher("le la les") == []


def test_base_reelle_se_charge():
    """Toutes les fiches du dépôt doivent avoir un en-tête valide."""
    base = BaseConnaissances(RACINE_KNOWLEDGE)
    publiques = [f for f in base.fiches if f.origine == "general"]
    assert publiques, "aucune fiche générale trouvée"
    for fiche in publiques:
        assert fiche.titre and fiche.acces == "public", fiche.id
        assert fiche.mots_cles, f"{fiche.id} : mots_cles manquants"
