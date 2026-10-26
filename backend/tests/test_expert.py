import asyncio

from app.expert import Expert

from .conftest import FauxClient


def collecter(expert, **kwargs):
    async def run():
        return [ev async for ev in expert.repondre(**kwargs)]

    return asyncio.run(run())


def test_recherche_puis_reponse_citee(base):
    client = FauxClient([
        {"outils": [{"requete": "séchage mur béton de chanvre"}]},
        {"textes": ["Plusieurs mois selon l'épaisseur ", "[02-beton#2]."]},
    ])
    evenements = collecter(
        Expert(base, client), question="Combien de temps sèche un mur ?", profil="artisan",
        historique=[], acces_interne=False,
    )
    types = [e["type"] for e in evenements]
    assert types == ["recherche", "texte", "texte", "sources", "fin"]

    sources = next(e for e in evenements if e["type"] == "sources")["sources"]
    assert {"ref": "02-beton#2", "cite": True}.items() <= next(s for s in sources if s["ref"] == "02-beton#2").items()

    # Le 2e appel contient le tool_result avec l'extrait trouvé.
    resultat = client.appels[1]["messages"][-1]["content"][0]
    assert resultat["type"] == "tool_result" and resultat["is_error"] is False
    assert 'ref="02-beton#2"' in resultat["content"]


def test_parametres_modele(base):
    client = FauxClient([{"textes": ["Bonjour"]}])
    collecter(Expert(base, client), question="Bonjour", profil="particulier", historique=[], acces_interne=False)
    appel = client.appels[0]
    assert appel["model"] == "claude-opus-5-5"
    assert appel["output_config"] == {"effort": "medium"}
    assert appel["fallbacks"] == "default" and appel["betas"] == ["server-side-fallback-2026-07-01"]
    assert "thinking" not in appel and "temperature" not in appel
    assert "Particulier" in appel["system"][1]["text"]


def test_entree_outil_invalide_renvoie_erreur(base):
    client = FauxClient([{"outils": [{"autre": 1}]}, {"textes": ["Ok"]}])
    collecter(Expert(base, client), question="?", profil="particulier", historique=[], acces_interne=False)
    resultat = client.appels[1]["messages"][-1]["content"][0]
    assert resultat["is_error"] is True and "INVALID_JSON" in resultat["content"]


def test_documents_internes_invisibles_hors_profil_commercial(base):
    client = FauxClient([{"outils": [{"requete": "objection prix"}]}, {"textes": ["..."]}])
    collecter(Expert(base, client), question="prix ?", profil="particulier", historique=[], acces_interne=False)
    assert "Argumentaire" not in client.appels[1]["messages"][-1]["content"][0]["content"]


def test_refus(base):
    client = FauxClient([{"stop_reason": "refusal"}])
    evenements = collecter(Expert(base, client), question="?", profil="particulier", historique=[], acces_interne=False)
    assert evenements[-1]["type"] == "erreur"


def test_limite_de_recherches(base, monkeypatch):
    from app import expert as module

    monkeypatch.setattr(module.settings, "max_recherches_par_question", 1)
    client = FauxClient([{"outils": [{"requete": "chanvre"}]}] * 2)
    evenements = collecter(Expert(base, client), question="?", profil="particulier", historique=[], acces_interne=False)
    assert evenements[-1]["type"] == "erreur"
