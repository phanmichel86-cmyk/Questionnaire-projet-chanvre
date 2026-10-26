from __future__ import annotations

import hmac
import json
import time
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .expert import Expert
from .knowledge import BaseConnaissances
from .schemas import FicheResume, QuestionRequest

app = FastAPI(title="Expert construction chanvre", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

base = BaseConnaissances(settings.knowledge_dir)
expert = Expert(base)
_requetes_par_ip: dict[str, deque[float]] = defaultdict(deque)


def acces_interne_autorise(code: str | None) -> bool:
    """Sans code configuré, l'accès interne est libre (usage local / intranet)."""
    if not settings.code_acces_interne:
        return True
    return code is not None and hmac.compare_digest(code, settings.code_acces_interne)


def verifier_quota(ip: str) -> None:
    if settings.questions_par_heure <= 0:
        return
    maintenant = time.monotonic()
    fenetre = _requetes_par_ip[ip]
    while fenetre and maintenant - fenetre[0] > 3600:
        fenetre.popleft()
    if len(fenetre) >= settings.questions_par_heure:
        raise HTTPException(429, "Trop de questions sur la dernière heure, réessayez plus tard.")
    fenetre.append(maintenant)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "modele": settings.expert_modele,
        "fiches": len(base.fiches),
        "extraits": len(base.extraits),
    }


@app.get("/api/config")
def config_publique() -> dict:
    return {"code_requis_pour_commercial": bool(settings.code_acces_interne)}


@app.get("/api/fiches", response_model=list[FicheResume])
def lister_fiches(code_acces: str | None = None) -> list[dict]:
    return base.resume(acces_interne=bool(code_acces) and acces_interne_autorise(code_acces))


@app.post("/api/recharger")
def recharger(code_acces: str | None = None) -> dict:
    """Relit les fichiers de knowledge/ après ajout ou modification d'une fiche."""
    if not settings.code_acces_interne or not acces_interne_autorise(code_acces):
        raise HTTPException(403, "Rechargement réservé (définir CODE_ACCES_INTERNE).")
    base.charger()
    return {"fiches": len(base.fiches), "extraits": len(base.extraits)}


@app.post("/api/chat")
async def chat(req: QuestionRequest, request: Request) -> StreamingResponse:
    acces_interne = False
    if req.profil == "commercial":
        if not acces_interne_autorise(req.code_acces):
            raise HTTPException(403, "Code d'accès interne invalide.")
        acces_interne = True
    verifier_quota(request.client.host if request.client else "inconnu")

    historique = [m.model_dump() for m in req.historique[-20:]]
    # L'API exige que la conversation commence par un message utilisateur.
    while historique and historique[0]["role"] != "user":
        historique.pop(0)

    async def flux():
        async for evenement in expert.repondre(req.question, req.profil, historique, acces_interne):
            yield f"data: {json.dumps(evenement, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        flux(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if settings.frontend_dir.is_dir():
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
