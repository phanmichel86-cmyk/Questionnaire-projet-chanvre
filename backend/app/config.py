from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RACINE_PROJET = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Clé lue automatiquement par le SDK Anthropic (ANTHROPIC_API_KEY).
    anthropic_api_key: str = ""
    expert_modele: str = "claude-opus-5-5"
    # low | medium | high : profondeur de réflexion (et coût) par réponse.
    expert_effort: str = "medium"
    expert_max_tokens: int = 16000
    # Bascule automatique vers un autre modèle si une requête est refusée par erreur.
    expert_fallbacks: bool = True
    max_recherches_par_question: int = 6

    knowledge_dir: Path = RACINE_PROJET / "knowledge"
    frontend_dir: Path = RACINE_PROJET / "frontend"

    # Si renseigné, le profil « commercial » (et donc les documents internes)
    # n'est accessible qu'avec ce code. À définir avant toute mise en ligne publique.
    code_acces_interne: str = ""

    # Limite anti-abus : nombre de questions par adresse IP et par heure (0 = illimité).
    questions_par_heure: int = 40
    cors_origins: str = "http://localhost:8000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
