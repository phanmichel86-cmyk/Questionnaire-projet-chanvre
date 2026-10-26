"""Boucle de dialogue avec Claude : recherche dans la base, puis réponse en streaming.

`repondre()` est un générateur asynchrone d'événements (dict) que l'API transmet
au navigateur en Server-Sent Events :
  - {"type": "recherche", "requete": ...}       Claude interroge la base
  - {"type": "texte", "texte": ...}             fragment de la réponse
  - {"type": "sources", "sources": [...]}       extraits consultés (cite: bool)
  - {"type": "fin", "usage": {...}}             fin normale
  - {"type": "erreur", "message": ...}          échec (message lisible)
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import AsyncIterator
from typing import Any

import anthropic

from .config import settings
from .knowledge import BaseConnaissances
from .prompts import OUTIL_RECHERCHE, construire_systeme

log = logging.getLogger(__name__)

# Modèles qui acceptent la bascule serveur `fallbacks: "default"`.
MODELES_AVEC_FALLBACK = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}
BETA_FALLBACK = "server-side-fallback-2026-07-01"
MAX_ESSAIS_JSON = 2


class Expert:
    def __init__(self, base: BaseConnaissances, client: anthropic.AsyncAnthropic | None = None):
        self.base = base
        self._client = client

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            cle = settings.anthropic_api_key or None  # sinon : résolution standard du SDK
            self._client = anthropic.AsyncAnthropic(api_key=cle)
        return self._client

    def _parametres(self, profil: str) -> dict[str, Any]:
        params: dict[str, Any] = {
            "model": settings.expert_modele,
            "max_tokens": settings.expert_max_tokens,
            "system": construire_systeme(profil),
            "tools": [OUTIL_RECHERCHE],
            "output_config": {"effort": settings.expert_effort},
            # Met en cache le préfixe (système + outils + historique) entre les tours.
            "cache_control": {"type": "ephemeral"},
        }
        if settings.expert_fallbacks and settings.expert_modele in MODELES_AVEC_FALLBACK:
            params["betas"] = [BETA_FALLBACK]
            params["fallbacks"] = "default"
        return params

    def executer_recherche(
        self, entree: Any, profil: str, acces_interne: bool, consultes: dict[str, dict]
    ) -> tuple[str, bool]:
        """Exécute l'outil de recherche. Renvoie (contenu du tool_result, est_erreur)."""
        if not isinstance(entree, dict) or not isinstance(entree.get("requete"), str):
            return json.dumps({"INVALID_JSON": json.dumps(entree, ensure_ascii=False)}), True
        requete = entree["requete"].strip()
        nb = entree.get("nb_resultats", 5)
        nb = max(1, min(10, nb)) if isinstance(nb, int) else 5
        if not requete:
            return "Requête vide : précise les mots-clés à rechercher.", True

        resultats = self.base.rechercher(requete, profil=profil, acces_interne=acces_interne, limite=nb)
        if not resultats:
            return (
                f"Aucun extrait trouvé pour « {requete} ». Essaie d'autres termes ou synonymes ; "
                "si la base ne couvre pas le sujet, dis-le à l'utilisateur."
            ), False

        blocs = []
        for r in resultats:
            e = r.extrait
            origine = "Document Planète Chanvre" if e.fiche.origine == "prive" else "Documentation générale"
            consultes.setdefault(
                e.ref,
                {"ref": e.ref, "titre": e.fiche.titre, "section": e.section, "fiche": e.fiche.id, "origine": e.fiche.origine},
            )
            blocs.append(
                f'<extrait ref="{e.ref}" fiche="{e.fiche.titre}" section="{e.section}" origine="{origine}">\n'
                f"{e.texte}\n</extrait>"
            )
        return "\n\n".join(blocs), False

    async def repondre(
        self,
        question: str,
        profil: str,
        historique: list[dict[str, str]],
        acces_interne: bool,
    ) -> AsyncIterator[dict[str, Any]]:
        messages: list[dict[str, Any]] = [*historique, {"role": "user", "content": question}]
        params = self._parametres(profil)
        consultes: dict[str, dict] = {}
        texte_final: list[str] = []
        usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}
        essais_json = 0

        try:
            for _ in range(settings.max_recherches_par_question + 1):
                try:
                    async with self.client.beta.messages.stream(messages=messages, **params) as stream:
                        async for event in stream:
                            if event.type == "text":
                                texte_final.append(event.text)
                                yield {"type": "texte", "texte": event.text}
                        reponse = await stream.get_final_message()
                    essais_json = 0
                except ValueError:
                    # JSON d'outil illisible pendant le streaming : on relance le tour.
                    essais_json += 1
                    if essais_json > MAX_ESSAIS_JSON:
                        raise
                    continue

                usage["input_tokens"] += reponse.usage.input_tokens or 0
                usage["output_tokens"] += reponse.usage.output_tokens or 0
                usage["cache_read_input_tokens"] += reponse.usage.cache_read_input_tokens or 0

                if reponse.stop_reason == "refusal":
                    yield {
                        "type": "erreur",
                        "message": "Je ne peux pas répondre à cette demande. Reformulez votre question "
                        "en restant sur la construction en chanvre.",
                    }
                    return

                appels = [b for b in reponse.content if b.type == "tool_use"]
                if not appels:
                    break
                if reponse.stop_reason == "max_tokens":
                    yield {"type": "erreur", "message": "Réponse interrompue (longueur maximale atteinte)."}
                    return

                messages.append({"role": "assistant", "content": reponse.content})
                resultats = []
                for appel in appels:
                    if isinstance(appel.input, dict) and isinstance(appel.input.get("requete"), str):
                        yield {"type": "recherche", "requete": appel.input["requete"]}
                    contenu, erreur = self.executer_recherche(appel.input, profil, acces_interne, consultes)
                    resultats.append(
                        {"type": "tool_result", "tool_use_id": appel.id, "content": contenu, "is_error": erreur}
                    )
                messages.append({"role": "user", "content": resultats})
            else:
                yield {
                    "type": "erreur",
                    "message": "Trop de recherches pour cette question : essayez de la découper.",
                }
                return
        except anthropic.AuthenticationError:
            yield {"type": "erreur", "message": "Clé API Anthropic absente ou invalide (ANTHROPIC_API_KEY)."}
            return
        except anthropic.RateLimitError:
            yield {"type": "erreur", "message": "Service momentanément saturé, réessayez dans une minute."}
            return
        except anthropic.APIConnectionError:
            yield {"type": "erreur", "message": "Connexion au service Claude impossible, réessayez."}
            return
        except anthropic.APIStatusError as exc:
            log.exception("Erreur API Claude")
            yield {"type": "erreur", "message": f"Erreur du service Claude ({exc.status_code})."}
            return
        except Exception:
            # Ex. clé API non configurée (le SDK lève alors une TypeError avant l'envoi).
            log.exception("Erreur inattendue pendant la réponse")
            message = "Erreur interne du serveur."
            if not (settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY")):
                message = "Clé API Anthropic non configurée (ANTHROPIC_API_KEY dans backend/.env)."
            yield {"type": "erreur", "message": message}
            return

        cites = set(re.findall(r"([\w\-]+#\d+)", "".join(texte_final)))
        sources = [{**s, "cite": s["ref"] in cites} for s in consultes.values()]
        yield {"type": "sources", "sources": sources}
        yield {"type": "fin", "usage": usage}
