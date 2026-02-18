import re
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, field_validator


# --- Auth ---
class UserRegister(BaseModel):
    nombre: str
    apellido: str
    documento: str
    correo: EmailStr
    celular: Optional[str] = None
    password: str
    acepta_whatsapp: Optional[bool] = False

    @field_validator("nombre", "apellido")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v.strip()) < 2:
            raise ValueError("Mínimo 2 caracteres")
        if not re.match(r"^[a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s]+$", v):
            raise ValueError("Solo se permiten letras")
        return v.strip()

    @field_validator("documento")
    @classmethod
    def validate_documento(cls, v: str) -> str:
        if not re.match(r"^\d+$", v):
            raise ValueError("Solo se permiten números")
        return v.strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mínimo 8 caracteres")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Debe contener al menos una mayúscula")
        if not re.search(r"\d", v):
            raise ValueError("Debe contener al menos un número")
        return v


class UserLogin(BaseModel):
    correo: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# --- User ---
class UserOut(BaseModel):
    id: UUID
    nombre: str
    apellido: str
    documento: str
    correo: str
    celular: Optional[str] = None
    rol: str
    activo: bool
    correo_verificado: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    celular: Optional[str] = None


class AdminUserCreate(BaseModel):
    nombre: str
    apellido: str
    documento: str
    correo: EmailStr
    celular: Optional[str] = None
    password: str
    rol: str = "estudiante"


class ChangePasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mínimo 8 caracteres")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Debe contener al menos una mayúscula")
        if not re.search(r"\d", v):
            raise ValueError("Debe contener al menos un número")
        return v


class ChangeRoleRequest(BaseModel):
    rol: str

    @field_validator("rol")
    @classmethod
    def validate_rol(cls, v: str) -> str:
        if v not in ("admin", "profesor", "estudiante"):
            raise ValueError("Rol debe ser admin, profesor o estudiante")
        return v


class AdminMateriaOut(BaseModel):
    id: UUID
    nombre: str
    codigo: str
    profesor_id: Optional[UUID] = None
    profesor_nombre: Optional[str] = None
    created_at: datetime
    num_estudiantes: int = 0
    num_examenes: int = 0

    class Config:
        from_attributes = True


# --- Sesion ---
class SesionOut(BaseModel):
    id: UUID
    user_id: UUID
    ip: Optional[str] = None
    dispositivo: Optional[str] = None
    fecha_inicio: datetime
    fecha_fin: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Materia ---
class MateriaCreate(BaseModel):
    nombre: str


class MateriaOut(BaseModel):
    id: UUID
    nombre: str
    codigo: str
    profesor_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MateriaWithStudents(MateriaOut):
    estudiantes: list[UserOut] = []


class InscripcionRequest(BaseModel):
    codigo: str


# --- Examen ---
class ExamenCreate(BaseModel):
    titulo: str
    tipo: Optional[str] = None
    contenido_json: Optional[dict] = None
    clave_respuestas: Optional[dict] = None
    activo_online: bool = False
    fecha_limite: Optional[datetime] = None


class ExamenOut(BaseModel):
    id: UUID
    materia_id: UUID
    titulo: str
    tipo: Optional[str] = None
    contenido_json: Optional[dict] = None
    activo_online: bool
    fecha_limite: Optional[datetime] = None
    fecha_activacion: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ExamenProfesorOut(ExamenOut):
    """Includes answer key - only for professor"""
    clave_respuestas: Optional[dict] = None


# --- Nota ---
class NotaCreate(BaseModel):
    estudiante_id: UUID
    examen_id: UUID
    nota: float
    detalle_json: Optional[dict] = None
    retroalimentacion: Optional[str] = None


class NotaUpdate(BaseModel):
    nota: Optional[float] = None
    detalle_json: Optional[dict] = None
    retroalimentacion: Optional[str] = None


class NotaOut(BaseModel):
    id: UUID
    estudiante_id: UUID
    examen_id: UUID
    nota: Optional[float] = None
    detalle_json: Optional[dict] = None
    retroalimentacion: Optional[str] = None
    imagen_procesada_url: Optional[str] = None
    texto_extraido: Optional[str] = None
    created_at: datetime
    # Enrichment fields (populated via joins)
    estudiante_nombre: Optional[str] = None
    estudiante_apellido: Optional[str] = None
    examen_titulo: Optional[str] = None
    materia_nombre: Optional[str] = None

    class Config:
        from_attributes = True


# --- Exam Generation ---
class ExamGenerationRequest(BaseModel):
    materia_id: UUID
    titulo: str
    tema: str
    nivel: str = "intermedio"  # basico, intermedio, avanzado
    grado: Optional[str] = None  # grado escolar colombiano
    distribucion: dict  # {"seleccion_multiple": 5, "verdadero_falso": 3, ...}
    contenido_base: Optional[str] = None  # texto o contenido del PDF


# --- Grading ---
class GradingRequest(BaseModel):
    examen_id: UUID
    estudiante_id: UUID


# --- RAG Chat ---
class ChatMessage(BaseModel):
    message: str
    nota_id: UUID


class ChatResponse(BaseModel):
    response: str


class ChatHistoryOut(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Notifications ---
class PreferenciaNotifUpdate(BaseModel):
    acepta_email: Optional[bool] = None
    acepta_whatsapp: Optional[bool] = None


class PreferenciaNotifOut(BaseModel):
    acepta_email: bool
    acepta_whatsapp: bool

    class Config:
        from_attributes = True


# --- Online Responses ---
class RespuestaOnlineCreate(BaseModel):
    examen_id: UUID
    respuestas_json: dict


class RespuestaOnlineOut(BaseModel):
    id: UUID
    estudiante_id: UUID
    examen_id: UUID
    respuestas_json: Optional[dict] = None
    enviado_at: datetime

    class Config:
        from_attributes = True


# --- Audit ---
class AuditLogOut(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    accion: str
    detalle: Optional[dict] = None
    ip: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Stats ---
class AdminStats(BaseModel):
    total_usuarios: int
    sesiones_activas: int
    examenes_calificados_hoy: int
    usuarios_activos: int
    usuarios_inactivos: int
    total_profesores: int = 0
    total_estudiantes: int = 0
    total_admins: int = 0
    total_materias: int = 0
    total_examenes: int = 0
    total_notas: int = 0
    promedio_global: Optional[float] = None
    examenes_online_activos: int = 0
    registros_ultimos_7_dias: int = 0


class APIUsageByModel(BaseModel):
    model: str
    task: str
    requests: int
    total_tokens: int


class APIUsageStats(BaseModel):
    total_requests_today: int = 0
    total_requests_this_month: int = 0
    total_tokens_today: int = 0
    total_tokens_this_month: int = 0
    requests_per_day_limit: int = 14400          # Groq free: 14400 req/day
    tokens_per_minute_limit: int = 6000          # Groq free: 6000 TPM
    requests_per_minute_limit: int = 30          # Groq free: 30 RPM
    remaining_requests_today: int = 0
    usage_by_task: list[APIUsageByModel] = []
    daily_history: list[dict] = []               # last 7 days
