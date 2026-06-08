import aiosmtplib
import httpx
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Template
from app.core.config import get_settings

settings = get_settings()

# Email templates
EMAIL_TEMPLATES = {
    "nota_publicada": Template("""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">📝 Nueva Calificación - XCalificator</h2>
        <p>Hola <strong>{{ nombre }}</strong>,</p>
        <p>Se ha publicado una nueva calificación para el examen: <strong>{{ examen }}</strong></p>
        <p>Nota obtenida: <strong>{{ nota }}/{{ nota_maxima }}</strong></p>
        <p>Ingresa a la plataforma para ver la retroalimentación detallada.</p>
        <hr>
        <p style="color: #6b7280; font-size: 12px;">XCalificator - Plataforma Educativa IA</p>
    </body>
    </html>
    """),
    "examen_asignado": Template("""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">📋 Nuevo Examen Asignado - XCalificator</h2>
        <p>Hola <strong>{{ nombre }}</strong>,</p>
        <p>Se ha asignado un nuevo examen en la materia: <strong>{{ materia }}</strong></p>
        <p>Examen: <strong>{{ examen }}</strong></p>
        {% if fecha_limite %}
        <p>Fecha límite: <strong>{{ fecha_limite }}</strong></p>
        {% endif %}
        <hr>
        <p style="color: #6b7280; font-size: 12px;">XCalificator - Plataforma Educativa IA</p>
    </body>
    </html>
    """),
    "cuenta_creada": Template("""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">🎉 Bienvenido a XCalificator</h2>
        <p>Hola <strong>{{ nombre }}</strong>,</p>
        <p>Tu cuenta ha sido creada exitosamente.</p>
        <p>Rol asignado: <strong>{{ rol }}</strong></p>
        <p>Puedes iniciar sesión con tu correo y contraseña.</p>
        <hr>
        <p style="color: #6b7280; font-size: 12px;">XCalificator - Plataforma Educativa IA</p>
    </body>
    </html>
    """),
    "confirmar_correo": Template("""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">📧 Confirma tu correo - XCalificator</h2>
        <p>Hola <strong>{{ nombre }}</strong>,</p>
        <p>Gracias por registrarte en XCalificator. Para activar tu cuenta, confirma tu correo haciendo clic en el siguiente enlace:</p>
        <p style="text-align:center; margin: 24px 0;">
            <a href="{{ link }}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Confirmar mi correo</a>
        </p>
        <p style="color: #6b7280; font-size: 12px;">Si no creaste esta cuenta, puedes ignorar este mensaje. El enlace expira en 24 horas.</p>
        <hr>
        <p style="color: #6b7280; font-size: 12px;">XCalificator - Plataforma Educativa IA</p>
    </body>
    </html>
    """),
    "retroalimentacion": Template("""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">💬 Retroalimentación - XCalificator</h2>
        <p>Hola <strong>{{ nombre }}</strong>,</p>
        <p>Tu profesor ha enviado retroalimentación para el examen: <strong>{{ examen }}</strong></p>
        <p>Nota obtenida: <strong>{{ nota }}/{{ nota_maxima }}</strong></p>
        <p>Ingresa a la plataforma para ver los detalles o chatea con Xali para entender mejor tu resultado.</p>
        <hr>
        <p style="color: #6b7280; font-size: 12px;">XCalificator - Plataforma Educativa IA</p>
    </body>
    </html>
    """),
    "cambio_password": Template("""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #dc2626;">🔒 Cambio de Contraseña - XCalificator</h2>
        <p>Hola <strong>{{ nombre }}</strong>,</p>
        <p>Tu contraseña ha sido actualizada exitosamente.</p>
        <p>Si no realizaste este cambio, contacta al administrador inmediatamente.</p>
        <hr>
        <p style="color: #6b7280; font-size: 12px;">XCalificator - Plataforma Educativa IA</p>
    </body>
    </html>
    """),
    "examen_proximo": Template("""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #f59e0b;">⏰ Recordatorio de Examen - XCalificator</h2>
        <p>Hola <strong>{{ nombre }}</strong>,</p>
        <p>Tienes un examen próximo en las siguientes 24 horas:</p>
        <p>Materia: <strong>{{ materia }}</strong></p>
        <p>Examen: <strong>{{ examen }}</strong></p>
        <p>Fecha límite: <strong>{{ fecha_limite }}</strong></p>
        <hr>
        <p style="color: #6b7280; font-size: 12px;">XCalificator - Plataforma Educativa IA</p>
    </body>
    </html>
    """),
}

TELEGRAM_TEMPLATES = {
    "nota_publicada": "📝 *XCalificator* - Nueva calificación\nHola {nombre}, se publicó tu nota en *{examen}*: {nota}/{nota_maxima}. Revisa la retroalimentación en la plataforma.",
    "examen_asignado": "📋 *XCalificator* - Nuevo examen\nHola {nombre}, se asignó el examen *{examen}* en *{materia}*.",
    "examen_proximo": "⏰ *XCalificator* - Recordatorio\nHola {nombre}, tienes un examen en 24h: *{examen}* de *{materia}*.",
    "retroalimentacion": "💬 *XCalificator* - Retroalimentación\nHola {nombre}, tu profesor envió retroalimentación para *{examen}*. Nota: {nota}/{nota_maxima}. Revisa los detalles en la plataforma.",
}


async def send_email(to: str, subject: str, template_name: str, context: dict):
    """Send email via SMTP."""
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        return False

    template = EMAIL_TEMPLATES.get(template_name)
    if not template:
        return False

    html_content = template.render(**context)

    message = MIMEMultipart("alternative")
    message["From"] = settings.SMTP_USER
    message["To"] = to
    message["Subject"] = subject

    html_part = MIMEText(html_content, "html")
    message.attach(html_part)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASS,
            start_tls=True,
        )
        return True
    except Exception as e:
        print(f"Error enviando email: {e}")
        return False


async def notify_enrolled_students(
    db_session,
    materia_id: str,
    template_name: str,
    subject: str,
    context: dict,
):
    """Notify all enrolled students of a materia via their preferred channels.

    Optimizado: 2 queries en batch (Users + PreferenciaNotif) en vez de N+1.
    """
    from sqlalchemy import select
    from app.models.models import Matricula, User, PreferenciaNotif, Notificacion
    from datetime import datetime, timezone

    result = await db_session.execute(
        select(Matricula.estudiante_id).where(Matricula.materia_id == materia_id)
    )
    estudiante_ids = [row[0] for row in result.all()]

    if not estudiante_ids:
        return

    # Batch fetch Users (1 query)
    users_result = await db_session.execute(
        select(User).where(User.id.in_(estudiante_ids))
    )
    users = {u.id: u for u in users_result.scalars().all()}

    # Batch fetch PreferenciaNotif (1 query)
    prefs_result = await db_session.execute(
        select(PreferenciaNotif).where(PreferenciaNotif.user_id.in_(estudiante_ids))
    )
    prefs = {p.user_id: p for p in prefs_result.scalars().all()}

    now = datetime.now(timezone.utc)
    for est_id in estudiante_ids:
        user = users.get(est_id)
        if not user or not user.activo:
            continue

        pref = prefs.get(est_id)
        ctx = {**context, "nombre": user.nombre}

        # Email
        if pref and pref.acepta_email and user.correo:
            sent = await send_email(user.correo, subject, template_name, ctx)
            notif = Notificacion(
                user_id=est_id, tipo=template_name, canal="email",
                mensaje=subject, enviado=sent,
                fecha_envio=now if sent else None,
            )
            db_session.add(notif)

        # Telegram
        if pref and pref.acepta_telegram and user.telegram_chat_id:
            sent = await send_telegram(user.telegram_chat_id, template_name, ctx)
            notif = Notificacion(
                user_id=est_id, tipo=template_name, canal="telegram",
                mensaje=f"Telegram: {template_name}", enviado=sent,
                fecha_envio=now if sent else None,
            )
            db_session.add(notif)

    await db_session.commit()


async def send_telegram(chat_id: str, template_name: str, context: dict) -> bool:
    """Send a Telegram message via the bot. Returns True on success."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return False

    template = TELEGRAM_TEMPLATES.get(template_name)
    if not template:
        return False

    body = template.format(**context)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Escapar caracteres Markdown problemáticos para evitar 400 de Telegram
            # (mejor: cambiar a HTML en templates, pero esto es safe fix)
            safe_body = (
                body.replace("_", "\\_")
                    .replace("*", "\\*")
                    .replace("`", "\\`")
                    .replace("[", "\\[")
            )
            response = await client.post(
                f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": safe_body,
                    "parse_mode": "Markdown",
                },
            )
            if response.status_code == 200:
                # Telegram a veces devuelve 200 con {"ok": false}; validar
                try:
                    data = response.json()
                    if not data.get("ok", False):
                        print(f"Telegram rechazo el mensaje: {data.get('description', 'sin descripcion')}")
                        return False
                except Exception:
                    pass
                return True
            print(f"Error Telegram [{response.status_code}]: {response.text[:300]}")
            return False
    except Exception as e:
        print(f"Error enviando Telegram: {e}")
        return False
