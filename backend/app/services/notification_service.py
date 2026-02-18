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

WHATSAPP_TEMPLATES = {
    "nota_publicada": "📝 *XCalificator* - Nueva calificación\nHola {nombre}, se publicó tu nota en *{examen}*: {nota}/{nota_maxima}. Revisa la retroalimentación en la plataforma.",
    "examen_asignado": "📋 *XCalificator* - Nuevo examen\nHola {nombre}, se asignó el examen *{examen}* en *{materia}*.",
    "examen_proximo": "⏰ *XaClificator* - Recordatorio\nHola {nombre}, tienes un examen en 24h: *{examen}* de *{materia}*.",
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


async def send_whatsapp(to_number: str, template_name: str, context: dict) -> bool:
    """Send WhatsApp message via Whapi (gratuito).
    
    Whapi usa una API REST simple. Solo necesitas un token.
    Registro gratis en https://whapi.cloud
    El número debe incluir código de país sin '+', ej: '593991234567'
    """
    if not settings.WHAPI_TOKEN:
        print("Whapi: Token no configurado, omitiendo envío WhatsApp")
        return False

    template = WHATSAPP_TEMPLATES.get(template_name)
    if not template:
        return False

    body = template.format(**context)

    # Normalizar número: quitar +, espacios, guiones
    clean_number = to_number.replace("+", "").replace(" ", "").replace("-", "")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{settings.WHAPI_API_URL}/messages/text",
                headers={
                    "Authorization": f"Bearer {settings.WHAPI_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "to": f"{clean_number}@s.whatsapp.net",
                    "body": body,
                },
            )
            if response.status_code in (200, 201):
                print(f"WhatsApp enviado a {clean_number}")
                return True
            else:
                print(f"Error Whapi [{response.status_code}]: {response.text}")
                return False
    except Exception as e:
        print(f"Error enviando WhatsApp: {e}")
        return False
