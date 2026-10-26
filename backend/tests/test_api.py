import json

import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture
def client(base, monkeypatch):
    monkeypatch.setattr(main, "base", base)
    monkeypatch.setattr(main.settings, "code_acces_interne", "secret")
    monkeypatch.setattr(main.settings, "questions_par_heure", 0)

    appels = []

    async def faux_repondre(question, profil, historique, acces_interne):
        appels.append({"profil": profil, "historique": historique, "acces_interne": acces_interne})
        yield {"type": "texte", "texte": "Réponse"}
        yield {"type": "fin", "usage": {}}

    monkeypatch.setattr(main.expert, "repondre", faux_repondre)
    c = TestClient(main.app)
    c.appels = appels
    return c


def evenements(reponse):
    return [json.loads(l[6:]) for l in reponse.text.splitlines() if l.startswith("data: ")]


def test_health(client):
    assert client.get("/health").json()["fiches"] == 2


def test_chat_stream(client):
    r = client.post("/api/chat", json={"question": "Bonjour", "profil": "artisan"})
    assert r.status_code == 200
    assert [e["type"] for e in evenements(r)] == ["texte", "fin"]
    assert client.appels[0]["acces_interne"] is False


def test_profil_commercial_exige_le_code(client):
    assert client.post("/api/chat", json={"question": "?", "profil": "commercial"}).status_code == 403
    assert client.post("/api/chat", json={"question": "?", "profil": "commercial", "code_acces": "faux"}).status_code == 403
    r = client.post("/api/chat", json={"question": "?", "profil": "commercial", "code_acces": "secret"})
    assert r.status_code == 200 and client.appels[-1]["acces_interne"] is True


def test_historique_commence_par_un_message_utilisateur(client):
    historique = [{"role": "assistant", "content": "Bonjour"}, {"role": "user", "content": "Q1"}, {"role": "assistant", "content": "R1"}]
    client.post("/api/chat", json={"question": "Q2", "historique": historique})
    assert client.appels[-1]["historique"][0]["role"] == "user"


def test_fiches_internes_masquees(client):
    assert all(f["acces"] == "public" for f in client.get("/api/fiches").json())
    assert any(f["acces"] == "interne" for f in client.get("/api/fiches", params={"code_acces": "secret"}).json())


def test_quota(client, monkeypatch):
    monkeypatch.setattr(main.settings, "questions_par_heure", 1)
    main._requetes_par_ip.clear()
    assert client.post("/api/chat", json={"question": "a"}).status_code == 200
    assert client.post("/api/chat", json={"question": "b"}).status_code == 429
