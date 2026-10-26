from typing import Literal

from pydantic import BaseModel, Field

Profil = Literal["particulier", "artisan", "prescripteur", "commercial"]


class MessageHistorique(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20000)


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    profil: Profil = "particulier"
    historique: list[MessageHistorique] = Field(default_factory=list, max_length=40)
    code_acces: str | None = None


class FicheResume(BaseModel):
    id: str
    titre: str
    categorie: str
    acces: str
