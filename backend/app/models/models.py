import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Text, ForeignKey,
    Numeric, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(100), nullable=False)
    apellido = Column(String(100), nullable=False)
    documento = Column(String(50), unique=True, nullable=False)
    correo = Column(String(255), unique=True, nullable=False)
    celular = Column(String(20), nullable=True)
    password_hash = Column(Text, nullable=True)
    google_id = Column(String(255), unique=True, nullable=True)
    rol = Column(String(20), nullable=False, default="estudiante")
    activo = Column(Boolean, default=True)
    correo_verificado = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    sesiones = relationship("Sesion", back_populates="user", cascade="all, delete-orphan")
    materias = relationship("Materia", back_populates="profesor")
    matriculas = relationship("Matricula", back_populates="estudiante")
    notas = relationship("Nota", back_populates="estudiante")
    preferencia_notif = relationship("PreferenciaNotif", back_populates="user", uselist=False)
    notificaciones = relationship("Notificacion", back_populates="user")


class Sesion(Base):
    __tablename__ = "sesiones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    ip = Column(INET, nullable=True)
    dispositivo = Column(Text, nullable=True)
    fecha_inicio = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    fecha_fin = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sesiones")


class Materia(Base):
    __tablename__ = "materias"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(200), nullable=False)
    codigo = Column(String(20), unique=True, nullable=False)
    profesor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    profesor = relationship("User", back_populates="materias")
    matriculas = relationship("Matricula", back_populates="materia", cascade="all, delete-orphan")
    examenes = relationship("Examen", back_populates="materia", cascade="all, delete-orphan")


class Matricula(Base):
    __tablename__ = "matriculas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estudiante_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    materia_id = Column(UUID(as_uuid=True), ForeignKey("materias.id", ondelete="CASCADE"))
    fecha = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("estudiante_id", "materia_id"),)

    estudiante = relationship("User", back_populates="matriculas")
    materia = relationship("Materia", back_populates="matriculas")


class Examen(Base):
    __tablename__ = "examenes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    materia_id = Column(UUID(as_uuid=True), ForeignKey("materias.id", ondelete="CASCADE"))
    titulo = Column(String(300), nullable=False)
    tipo = Column(String(50), nullable=True)
    contenido_json = Column(JSONB, nullable=True)
    clave_respuestas = Column(JSONB, nullable=True)
    activo_online = Column(Boolean, default=False)
    fecha_limite = Column(DateTime(timezone=True), nullable=True)
    fecha_activacion = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    materia = relationship("Materia", back_populates="examenes")
    notas = relationship("Nota", back_populates="examen", cascade="all, delete-orphan")
    respuestas_online = relationship("RespuestaOnline", back_populates="examen", cascade="all, delete-orphan")


class Nota(Base):
    __tablename__ = "notas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estudiante_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    examen_id = Column(UUID(as_uuid=True), ForeignKey("examenes.id", ondelete="CASCADE"))
    nota = Column(Numeric(4, 2), nullable=True)
    detalle_json = Column(JSONB, nullable=True)
    retroalimentacion = Column(Text, nullable=True)
    imagen_procesada_url = Column(Text, nullable=True)
    texto_extraido = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    estudiante = relationship("User", back_populates="notas")
    examen = relationship("Examen", back_populates="notas")


class PreferenciaNotif(Base):
    __tablename__ = "preferencias_notif"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    acepta_email = Column(Boolean, default=True)
    acepta_whatsapp = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="preferencia_notif")


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    tipo = Column(String(100), nullable=True)
    canal = Column(String(20), nullable=True)
    mensaje = Column(Text, nullable=True)
    enviado = Column(Boolean, default=False)
    fecha_envio = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="notificaciones")


class RespuestaOnline(Base):
    __tablename__ = "respuestas_online"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estudiante_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    examen_id = Column(UUID(as_uuid=True), ForeignKey("examenes.id", ondelete="CASCADE"))
    respuestas_json = Column(JSONB, nullable=True)
    enviado_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("estudiante_id", "examen_id"),)

    estudiante = relationship("User")
    examen = relationship("Examen", back_populates="respuestas_online")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nota_id = Column(UUID(as_uuid=True), ForeignKey("notas.id", ondelete="CASCADE"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    role = Column(String(20), nullable=False)      # 'user' | 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_chat_history_nota", "nota_id", "created_at"),)


class APIUsageLog(Base):
    __tablename__ = "api_usage_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model = Column(String(100), nullable=False)
    task = Column(String(50), nullable=False)       # grading | exam_generation | rag_chat | classification
    prompt_tokens = Column(Numeric, default=0)
    completion_tokens = Column(Numeric, default=0)
    total_tokens = Column(Numeric, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_api_usage_created", "created_at"),)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    accion = Column(String(200), nullable=False)
    detalle = Column(JSONB, nullable=True)
    ip = Column(INET, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
