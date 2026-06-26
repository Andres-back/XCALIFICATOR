import re
from datetime import datetime, date
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator


ALLOWED_EMAIL_DOMAINS = ("gmail.com", "hotmail.com")
CELULAR_DIGITS_ONLY = re.compile(r"^\d{7,15}$")
DOCUMENTO_DIGITS_ONLY = re.compile(r"^\d{5,20}$")


# --- Auth ---
class UserRegister(BaseModel):
    nombre: str
    apellido: str
    documento: str
    correo: EmailStr
    celular: Optional[str] = None
    password: str
    acepta_telegram: Optional[bool] = False

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
        cleaned = v.strip()
        if not DOCUMENTO_DIGITS_ONLY.match(cleaned):
            raise ValueError("Solo se permiten números (5-20 dígitos)")
        return cleaned

    @field_validator("correo")
    @classmethod
    def validate_correo_domain(cls, v: str) -> str:
        cleaned = v.strip().lower()
        domain = cleaned.split("@", 1)[-1] if "@" in cleaned else ""
        if domain not in ALLOWED_EMAIL_DOMAINS:
            raise ValueError(
                f"Solo se aceptan correos @gmail.com o @hotmail.com (recibido: @{domain})"
            )
        return cleaned

    @field_validator("celular")
    @classmethod
    def validate_celular(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v.strip() == "":
            return None
        cleaned = re.sub(r"[\s\-\(\)\+]", "", v).strip()
        if not CELULAR_DIGITS_ONLY.match(cleaned):
            raise ValueError("Celular: solo números, 7-15 dígitos, sin espacios ni guiones")
        return cleaned

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


class TokenResponse(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: "UserOut"


class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None


# --- User ---
class UserOut(BaseModel):
    id: UUID
    nombre: str
    apellido: str
    documento: str
    correo: str
    celular: Optional[str] = None
    rol: str
    grado: Optional[str] = None
    activo: bool
    correo_verificado: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    celular: Optional[str] = None

    @field_validator("celular")
    @classmethod
    def validate_celular(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v.strip() == "":
            return None
        cleaned = re.sub(r"[\s\-\(\)\+]", "", v).strip()
        if not CELULAR_DIGITS_ONLY.match(cleaned):
            raise ValueError("Celular: solo números, 7-15 dígitos, sin espacios ni guiones")
        return cleaned


class AdminUserCreate(BaseModel):
    nombre: str
    apellido: str
    documento: str
    correo: EmailStr
    celular: Optional[str] = None
    password: str
    rol: str = "estudiante"
    grado: Optional[str] = None

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
        cleaned = v.strip()
        if not DOCUMENTO_DIGITS_ONLY.match(cleaned):
            raise ValueError("Solo se permiten números (5-20 dígitos)")
        return cleaned

    @field_validator("correo")
    @classmethod
    def validate_correo_domain(cls, v: str) -> str:
        cleaned = v.strip().lower()
        domain = cleaned.split("@", 1)[-1] if "@" in cleaned else ""
        if domain not in ALLOWED_EMAIL_DOMAINS:
            raise ValueError(
                f"Solo se aceptan correos @gmail.com o @hotmail.com (recibido: @{domain})"
            )
        return cleaned

    @field_validator("celular")
    @classmethod
    def validate_celular(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v.strip() == "":
            return None
        cleaned = re.sub(r"[\s\-\(\)\+]", "", v).strip()
        if not CELULAR_DIGITS_ONLY.match(cleaned):
            raise ValueError("Celular: solo números, 7-15 dígitos, sin espacios ni guiones")
        return cleaned


class AdminUserUpdate(BaseModel):
    grado: Optional[str] = None


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


class ChangeOwnPasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
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


class LocalAIConfigOut(BaseModel):
    content_provider: str = "groq"
    grading_provider: str = "groq"
    ocr_provider: str = "open_code_vision"
    groq_api_key: Optional[str] = None
    ollama_url: str = "http://host.docker.internal:11434"
    ollama_api_key: Optional[str] = None
    open_code_base_url: Optional[str] = None
    open_code_api_key: Optional[str] = None
    content_model: Optional[str] = None
    grading_local_model: Optional[str] = None
    ocr_local_model: Optional[str] = None
    open_code_content_model: Optional[str] = None
    open_code_vision_model: Optional[str] = None
    open_code_feedback_model: Optional[str] = None


class LocalAIConfigUpdate(BaseModel):
    content_provider: Optional[str] = None
    grading_provider: Optional[str] = None
    ocr_provider: Optional[str] = None
    groq_api_key: Optional[str] = None
    ollama_url: Optional[str] = None
    ollama_api_key: Optional[str] = None
    open_code_base_url: Optional[str] = None
    open_code_api_key: Optional[str] = None
    content_model: Optional[str] = None
    grading_local_model: Optional[str] = None
    ocr_local_model: Optional[str] = None
    open_code_content_model: Optional[str] = None
    open_code_vision_model: Optional[str] = None
    open_code_feedback_model: Optional[str] = None


class LocalOllamaModelsOut(BaseModel):
    ollama_url: str
    models: list[str] = []


# ── MateriaEncuentro schemas ──────────────────────────────────────────────
class MateriaEncuentroItem(BaseModel):
    dia_semana: str
    hora_inicio: str
    hora_fin: str


class MateriaEncuentroOut(BaseModel):
    id: UUID
    materia_id: UUID
    dia_semana: str
    hora_inicio: str
    hora_fin: str
    created_at: datetime

    class Config:
        from_attributes = True


class MateriaEncuentrosUpdate(BaseModel):
    encuentros: list[MateriaEncuentroItem]


# ── Presentacion (herramienta) advanced schemas ───────────────────────────
class PresentacionSlideItem(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    bullets: Optional[list[str]] = None
    image_url: Optional[str] = None


class PresentacionEditRequest(BaseModel):
    titulo: Optional[str] = None
    slides: list[PresentacionSlideItem] = []
    rerender: bool = False
    template_presenton: Optional[str] = None
    idioma_presentacion: Optional[str] = None
    tono_presentacion: Optional[str] = None
    verbosidad_presentacion: Optional[str] = None
    incluir_tabla_contenido: bool = False
    incluir_portada: bool = True
    busqueda_web: bool = False
    formato_exportacion: Optional[str] = None


class PresentacionRegenerateRequest(BaseModel):
    topic: Optional[str] = None
    grade: Optional[str] = None
    level: Optional[str] = None
    slides: Optional[int] = None
    mode: Optional[str] = None
    language: Optional[str] = None
    tone: Optional[str] = None
    verbosity: Optional[str] = None
    template: Optional[str] = None
    include_table_of_contents: bool = False
    include_title_slide: bool = True
    web_search: bool = False
    export_as: Optional[str] = None
    instructions: Optional[str] = None
    use_generated_images: bool = True
    export_google_slides: bool = False
    ollama_url: Optional[str] = None
    ollama_model: Optional[str] = None


class PresentacionGoogleExportOut(BaseModel):
    presentation_id: Optional[str] = None
    url: Optional[str] = None
    embed_url: Optional[str] = None


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
    encuentros: list[MateriaEncuentroItem] = Field(default_factory=list)
    dba_json: Optional[dict] = None
    plan_json: Optional[dict] = None


class MateriaCurriculoUpdate(BaseModel):
    dba_json: Optional[dict] = None
    plan_json: Optional[dict] = None


class MateriaOut(BaseModel):
    id: UUID
    nombre: str
    codigo: str
    profesor_id: Optional[UUID] = None
    dba_json: Optional[dict] = None
    plan_json: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MateriaCurriculoDocumentoOut(BaseModel):
    id: UUID
    materia_id: UUID
    titulo: str
    fuente_tipo: str
    texto_preview: str = ""
    chunks_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class InscripcionRequest(BaseModel):
    codigo: str


# --- Examen ---
class ExamenCreate(BaseModel):
    titulo: str
    tipo: Optional[str] = None
    contenido_json: Optional[dict] = None
    clave_respuestas: Optional[dict] = None
    activo_online: bool = False
    activo_fisico: bool = False
    fecha_limite: Optional[datetime] = None


class ExamenOut(BaseModel):
    id: UUID
    materia_id: UUID
    titulo: str
    tipo: Optional[str] = None
    contenido_json: Optional[dict] = None
    activo_online: bool
    activo_fisico: bool = False
    fecha_limite: Optional[datetime] = None
    fecha_activacion: Optional[datetime] = None
    modo_grupal: bool = False
    max_integrantes: int = 3
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
    examen_tipo: Optional[str] = None
    examen_contenido_json: Optional[dict] = None
    materia_nombre: Optional[str] = None
    respuestas_json: Optional[dict] = None
    enviado_at: Optional[datetime] = None

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


# --- RAG Chat ---
class ChatMessage(BaseModel):
    message: str
    nota_id: UUID


class ChatResponse(BaseModel):
    response: str
    preguntas_restantes: Optional[int] = None
    minutos_restantes: Optional[float] = None
    cooldown_segundos: Optional[int] = None
    puede_iniciar_nueva_sesion: Optional[bool] = None


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
    acepta_telegram: Optional[bool] = None


class PreferenciaNotifOut(BaseModel):
    acepta_email: bool
    acepta_telegram: bool
    telegram_chat_id: Optional[str] = None
    telegram_linked: bool = False

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


class HerramientaFlagUpdate(BaseModel):
    enabled: bool


class HerramientaFlagOut(BaseModel):
    tipo: str
    label: str
    enabled: bool
    updated_at: Optional[datetime] = None
    updated_by: Optional[UUID] = None


# --- Períodos Académicos ---
class PeriodoAcademicoCreate(BaseModel):
    nombre: str
    numero: int
    fecha_inicio: date
    fecha_fin: date
    porcentaje: float

    @field_validator("numero")
    @classmethod
    def validate_numero(cls, v: int) -> int:
        if v < 1 or v > 10:
            raise ValueError("El período debe estar entre 1 y 10")
        return v

    @field_validator("porcentaje")
    @classmethod
    def validate_porcentaje(cls, v: float) -> float:
        if v <= 0 or v > 100:
            raise ValueError("El porcentaje debe estar entre 0.01 y 100")
        return v


class PeriodoAcademicoUpdate(BaseModel):
    nombre: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    porcentaje: Optional[float] = None
    activo: Optional[bool] = None


class PeriodosBulkRequest(BaseModel):
    periodos: list[PeriodoAcademicoCreate] = []


class PeriodoAcademicoOut(BaseModel):
    id: UUID
    nombre: str
    numero: int
    fecha_inicio: date
    fecha_fin: date
    porcentaje: float
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Herramientas ---
class HerramientaGenerate(BaseModel):
    tipo: str  # 'examen', 'crucigrama', 'sopa_letras', 'emparejar', 'cuento'
    titulo: str = ""
    tema: str
    nivel: str = "intermedio"
    grado: Optional[str] = ""
    materia_id: Optional[str] = None
    distribucion: Optional[dict] = None
    contenido_base: Optional[str] = ""
    # Sopa de letras customization
    num_palabras: Optional[int] = 8
    palabras_obligatorias: Optional[list[str]] = None
    # Crucigrama customization
    num_horizontales: Optional[int] = 5
    num_verticales: Optional[int] = 5
    # Emparejar customization
    num_pares: Optional[int] = 6
    # Cuento customization
    moraleja_tema: Optional[str] = ""
    # Para colorear customization
    description_imagen: Optional[str] = ""
    # Vision-friendly generation options (graded by vision model)
    vision_friendly: Optional[bool] = True
    vision_prefijo: Optional[str] = "R"
    vision_hoja_respuestas: Optional[bool] = True
    vision_lineas_abiertas: Optional[int] = 3
    # Legacy aliases kept for API backwards-compatibility
    ocr_friendly: Optional[bool] = None
    ocr_prefijo: Optional[str] = None
    ocr_hoja_respuestas: Optional[bool] = None
    ocr_lineas_abiertas: Optional[int] = None

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, v: str) -> str:
        valid = ("examen", "crucigrama", "sopa_letras", "emparejar", "cuento", "para_colorear", "unir_columnas")
        if v not in valid:
            raise ValueError(f"Tipo debe ser: {', '.join(valid)}")
        return v

    @field_validator("vision_prefijo")
    @classmethod
    def validate_vision_prefijo(cls, v: Optional[str]) -> str:
        pref = (v or "R").strip().upper()
        if not pref:
            pref = "R"
        return pref[:4]

    @field_validator("vision_lineas_abiertas")
    @classmethod
    def validate_vision_lineas(cls, v: Optional[int]) -> int:
        lines = 3 if v is None else int(v)
        if lines < 1:
            return 1
        if lines > 8:
            return 8
        return lines


class HerramientaCreate(BaseModel):
    tipo: str  # 'examen', 'crucigrama', 'sopa_letras', 'emparejar', 'cuento', 'para_colorear', 'presentacion'
    titulo: str
    contenido_json: Optional[dict] = None
    clave_respuestas: Optional[dict] = None
    config_json: Optional[dict] = None

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, v: str) -> str:
        valid = ("examen", "crucigrama", "sopa_letras", "emparejar", "cuento", "para_colorear", "presentacion", "unir_columnas")
        if v not in valid:
            raise ValueError(f"Tipo debe ser: {', '.join(valid)}")
        return v


class HerramientaUpdate(BaseModel):
    titulo: Optional[str] = None
    contenido_json: Optional[dict] = None
    clave_respuestas: Optional[dict] = None
    config_json: Optional[dict] = None
    estado: Optional[str] = None


class HerramientaAssign(BaseModel):
    materia_id: UUID
    activo_online: bool = False
    fecha_limite: Optional[datetime] = None


class HerramientaOut(BaseModel):
    id: UUID
    profesor_id: UUID
    tipo: str
    titulo: str
    contenido_json: Optional[dict] = None
    clave_respuestas: Optional[dict] = None
    config_json: Optional[dict] = None
    estado: str
    materia_id: Optional[UUID] = None
    examen_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Asistencia ---
class AsistenciaCreate(BaseModel):
    fecha: date
    registros: list[dict]  # [{"estudiante_id": "...", "estado": "presente|ausente|tardanza|justificado", "observacion": "..."}]


class AsistenciaOut(BaseModel):
    id: UUID
    materia_id: UUID
    estudiante_id: UUID
    fecha: date
    estado: str
    observacion: Optional[str] = None
    created_at: datetime
    estudiante_nombre: Optional[str] = None
    estudiante_apellido: Optional[str] = None

    class Config:
        from_attributes = True


# --- Config Porcentajes ---
class ConfigPorcentajeCreate(BaseModel):
    periodo_id: UUID
    actividades: list[dict]  # [{"examen_id": "uuid", "porcentaje": 40.0}, ...]


class ConfigPorcentajeOut(BaseModel):
    id: UUID
    materia_id: UUID
    periodo_id: UUID
    examen_id: Optional[UUID] = None
    tipo_actividad: Optional[str] = None
    porcentaje: float

    class Config:
        from_attributes = True


# --- Boletín ---
class BoletinOut(BaseModel):
    id: UUID
    estudiante_id: UUID
    materia_id: UUID
    periodo_id: UUID
    nota_final: Optional[float] = None
    desglose_json: Optional[dict] = None
    publicado: bool
    publicado_at: Optional[datetime] = None
    created_at: datetime
    estudiante_nombre: Optional[str] = None
    materia_nombre: Optional[str] = None
    periodo_nombre: Optional[str] = None

    class Config:
        from_attributes = True


# --- Grupos ---
class GrupoCreate(BaseModel):
    examen_id: UUID
    nombre: Optional[str] = None


class InvitarMiembro(BaseModel):
    estudiante_id: UUID


class GrupoOut(BaseModel):
    id: UUID
    examen_id: UUID
    nombre: Optional[str] = None
    creador_id: Optional[UUID] = None
    miembros: list[dict] = []
    created_at: datetime

    class Config:
        from_attributes = True


# --- Chat Session ---
class ChatSessionOut(BaseModel):
    id: Optional[UUID] = None
    nota_id: Optional[UUID] = None
    preguntas_usadas: int = 0
    preguntas_restantes: int = 5
    minutos_restantes: float = 10.0
    cerrada: bool = True
    inicio: Optional[datetime] = None
    cooldown_segundos: Optional[int] = None
    puede_iniciar_nueva_sesion: Optional[bool] = None

    class Config:
        from_attributes = True


# --- Tesis Impacto ---
class TiempoEvaluacionCreate(BaseModel):
    materia_id: Optional[UUID] = None
    examen_id: Optional[UUID] = None
    fase: str
    actividad_tipo: str = "examen"
    grupo_pareado: Optional[str] = None
    duracion_minutos: float
    estudiantes_evaluados: int = 1
    observacion: Optional[str] = None

    @field_validator("fase")
    @classmethod
    def validate_fase(cls, v: str) -> str:
        valid = ("sin_sistema", "con_sistema")
        if v not in valid:
            raise ValueError(f"Fase debe ser: {', '.join(valid)}")
        return v

    @field_validator("duracion_minutos")
    @classmethod
    def validate_duracion(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("La duración debe ser mayor a 0")
        return v

    @field_validator("estudiantes_evaluados")
    @classmethod
    def validate_estudiantes(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Debe ser al menos 1 estudiante")
        return v


class TiempoEvaluacionOut(BaseModel):
    id: UUID
    profesor_id: UUID
    materia_id: Optional[UUID] = None
    examen_id: Optional[UUID] = None
    fase: str
    actividad_tipo: str
    grupo_pareado: Optional[str] = None
    duracion_minutos: float
    estudiantes_evaluados: int
    observacion: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EncuestaImpactoCreate(BaseModel):
    hito: str = "post_uso"
    claridad: int
    utilidad: int
    pertinencia: int
    satisfaccion: Optional[int] = None
    facilidad_uso: Optional[int] = None
    comentario: Optional[str] = None
    consentimiento: bool = True

    @field_validator("claridad", "utilidad", "pertinencia", "satisfaccion", "facilidad_uso")
    @classmethod
    def validate_likert(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if v < 1 or v > 5:
            raise ValueError("La escala Likert debe estar entre 1 y 5")
        return v

    @field_validator("consentimiento")
    @classmethod
    def validate_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes aceptar el consentimiento para participar")
        return v


class EncuestaImpactoOut(BaseModel):
    id: UUID
    user_id: UUID
    rol: str
    hito: str
    claridad: int
    utilidad: int
    pertinencia: int
    satisfaccion: Optional[int] = None
    facilidad_uso: Optional[int] = None
    comentario: Optional[str] = None
    consentimiento: bool
    created_at: datetime

    class Config:
        from_attributes = True
