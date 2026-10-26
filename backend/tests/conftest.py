from pathlib import Path
from types import SimpleNamespace

import pytest

from app.knowledge import BaseConnaissances

FICHE_BETON = """---
titre: Béton de chanvre — formulations
categorie: materiau
public: [artisan, prescripteur]
mots_cles: [hempcrete, chanvre-chaux, chènevotte]
---
# Béton de chanvre — formulations

## En bref
Le béton de chanvre associe chènevotte et liant à base de chaux.

## Dosages pour un mur
Pour un mur, compter environ 1 volume de chènevotte pour un dosage de liant adapté.
Le séchage d'un mur dure plusieurs mois selon l'épaisseur.

## Enduits
Les enduits chanvre-chaux corrigent les parois froides.
"""

FICHE_INTERNE = """---
titre: Argumentaire commercial
categorie: commercial
public: [commercial]
mots_cles: [objection, prix]
---
# Argumentaire commercial

## Objection prix
Réponse à l'objection « le chanvre est trop cher » : raisonner en coût global.
"""


@pytest.fixture
def dossier_knowledge(tmp_path: Path) -> Path:
    (tmp_path / "general").mkdir()
    (tmp_path / "prive" / "sources").mkdir(parents=True)
    (tmp_path / "general" / "02-beton.md").write_text(FICHE_BETON, encoding="utf-8")
    (tmp_path / "prive" / "argumentaire.md").write_text(FICHE_INTERNE, encoding="utf-8")
    (tmp_path / "prive" / "README.md").write_text("# À ignorer\n\n## Section\nprix", encoding="utf-8")
    return tmp_path


@pytest.fixture
def base(dossier_knowledge: Path) -> BaseConnaissances:
    return BaseConnaissances(dossier_knowledge)


class FauxStream:
    """Imite `client.beta.messages.stream(...)` pour un tour de réponse scripté."""

    def __init__(self, tour: dict):
        self.tour = tour

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        async def gen():
            for t in self.tour.get("textes", []):
                yield SimpleNamespace(type="text", text=t)

        return gen()

    async def get_final_message(self):
        contenu = [SimpleNamespace(type="text", text=t) for t in self.tour.get("textes", [])]
        for i, entree in enumerate(self.tour.get("outils", [])):
            contenu.append(SimpleNamespace(type="tool_use", id=f"toolu_{i}", name="rechercher_base_connaissances", input=entree))
        return SimpleNamespace(
            content=contenu,
            stop_reason=self.tour.get("stop_reason", "tool_use" if self.tour.get("outils") else "end_turn"),
            usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0),
        )


class FauxClient:
    """Client Anthropic factice : rejoue une liste de tours et mémorise les appels."""

    def __init__(self, tours: list[dict]):
        self.tours = list(tours)
        self.appels: list[dict] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))

    def _stream(self, **kwargs):
        # Copie de la liste : l'appelant la complète ensuite pour les tours suivants.
        self.appels.append({**kwargs, "messages": list(kwargs["messages"])})
        return FauxStream(self.tours.pop(0))
