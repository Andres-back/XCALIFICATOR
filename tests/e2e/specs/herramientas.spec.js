// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const API = 'http://localhost:8000/api';
const ADMIN_EMAIL = 'admin@xcalificator.com';
const ADMIN_PASS = 'Admin123!';

/** Obtiene token JWT directamente via API */
async function getToken(request) {
  const res = await request.post(`${API}/auth/login`, {
    data: { correo: ADMIN_EMAIL, password: ADMIN_PASS },
  });
  const body = await res.json();
  return body.access_token;
}

/** Llama al endpoint de generación y valida la respuesta */
async function generateHerramienta(request, token, payload) {
  const res = await request.post(`${API}/herramientas/generate`, {
    data: payload,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 180_000,
  });
  expect(res.status(), `HTTP status para tipo=${payload.tipo}`).toBe(200);
  return await res.json();
}

test.describe('Generación de herramientas con Open Code', () => {
  let token;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
    expect(token, 'Debe obtener token JWT').toBeTruthy();
  });

  // ─── Crucigrama ────────────────────────────────────────────────────────────
  test('crucigrama — genera pistas horizontales y verticales', async ({ request }) => {
    const r = await generateHerramienta(request, token, {
      tipo: 'crucigrama',
      tema: 'El sistema solar',
      nivel: 'basico',
      grado: '6',
      num_horizontales: 4,
      num_verticales: 4,
    });

    expect(r.tipo).toBe('crucigrama');
    const cruc = r.contenido_json?.crucigrama;
    expect(cruc, 'contenido_json.crucigrama existe').toBeTruthy();
    expect(cruc.pistas_horizontal.length, 'Tiene pistas horizontales').toBeGreaterThan(0);
    expect(cruc.pistas_vertical.length, 'Tiene pistas verticales').toBeGreaterThan(0);
    cruc.pistas_horizontal.forEach((p) => {
      expect(p.pista, 'Cada pista tiene texto').toBeTruthy();
      expect(p.respuesta, 'Cada respuesta es una palabra en mayúsculas').toMatch(/^[A-ZÁÉÍÓÚÑ]+$/i);
    });
    console.log(`  ✓ ${cruc.pistas_horizontal.length}H / ${cruc.pistas_vertical.length}V pistas`);
  });

  // ─── Sopa de letras ────────────────────────────────────────────────────────
  test('sopa_letras — genera grid 15x15 con palabras', async ({ request }) => {
    const r = await generateHerramienta(request, token, {
      tipo: 'sopa_letras',
      tema: 'Animales de la selva',
      nivel: 'basico',
      grado: '4',
      num_palabras: 5,
    });

    expect(r.tipo).toBe('sopa_letras');
    const sopa = r.contenido_json?.sopa_letras;
    expect(sopa, 'contenido_json.sopa_letras existe').toBeTruthy();
    expect(sopa.grid.length, 'Grid tiene al menos 10 filas').toBeGreaterThanOrEqual(10);
    expect(sopa.grid[0].length, 'Grid tiene al menos 10 columnas').toBeGreaterThanOrEqual(10);
    expect(sopa.palabras.length, 'Tiene palabras').toBeGreaterThan(0);
    sopa.grid.forEach((row, i) => {
      row.forEach((cell, j) => {
        expect(cell, `Celda [${i}][${j}] es una letra`).toMatch(/^[A-ZÁÉÍÓÚÑ]$/i);
      });
    });
    console.log(`  ✓ Grid ${sopa.grid.length}x${sopa.grid[0].length}, palabras: ${sopa.palabras.join(', ')}`);
  });

  // ─── Emparejar ─────────────────────────────────────────────────────────────
  test('emparejar — genera pares con id, izquierda y derecha', async ({ request }) => {
    const r = await generateHerramienta(request, token, {
      tipo: 'emparejar',
      tema: 'Capitales de Colombia',
      nivel: 'basico',
      grado: '7',
      num_pares: 5,
    });

    expect(r.tipo).toBe('emparejar');
    const emp = r.contenido_json?.emparejar;
    expect(emp, 'contenido_json.emparejar existe').toBeTruthy();
    expect(emp.pares.length, 'Tiene pares').toBeGreaterThanOrEqual(4);
    emp.pares.forEach((p) => {
      expect(p.izquierda, 'Par tiene izquierda').toBeTruthy();
      expect(p.derecha, 'Par tiene derecha').toBeTruthy();
    });
    console.log(`  ✓ ${emp.pares.length} pares generados`);
  });

  // ─── Unir columnas ─────────────────────────────────────────────────────────
  test('unir_columnas — genera pares con instrucciones', async ({ request }) => {
    const r = await generateHerramienta(request, token, {
      tipo: 'unir_columnas',
      tema: 'Países y capitales de América del Sur',
      nivel: 'intermedio',
      grado: '9',
      num_pares: 5,
    });

    expect(r.tipo).toBe('unir_columnas');
    const uc = r.contenido_json?.unir_columnas;
    expect(uc, 'contenido_json.unir_columnas existe').toBeTruthy();
    expect(uc.instrucciones, 'Tiene instrucciones').toBeTruthy();
    expect(uc.pares.length, 'Tiene pares').toBeGreaterThanOrEqual(4);
    console.log(`  ✓ ${uc.pares.length} pares, instrucciones: "${uc.instrucciones.slice(0, 50)}..."`);
  });

  // ─── Cuento ────────────────────────────────────────────────────────────────
  test('cuento — genera texto, moraleja y personajes', async ({ request }) => {
    const r = await generateHerramienta(request, token, {
      tipo: 'cuento',
      tema: 'El cuidado del medio ambiente',
      nivel: 'basico',
      grado: '5',
    });

    expect(r.tipo).toBe('cuento');
    const cuento = r.contenido_json?.cuento;
    expect(cuento, 'contenido_json.cuento existe').toBeTruthy();
    expect(cuento.texto.length, 'Texto tiene al menos 200 caracteres').toBeGreaterThan(200);
    expect(cuento.moraleja, 'Tiene moraleja').toBeTruthy();
    expect(Array.isArray(cuento.personajes), 'personajes es array').toBe(true);
    console.log(`  ✓ ${cuento.texto.length} chars, moraleja: "${cuento.moraleja.slice(0, 60)}..."`);
  });

  // ─── Examen ────────────────────────────────────────────────────────────────
  test('examen — genera preguntas con enunciado y respuesta', async ({ request }) => {
    const r = await generateHerramienta(request, token, {
      tipo: 'examen',
      tema: 'La fotosíntesis',
      nivel: 'basico',
      grado: '7',
      distribucion: { seleccion_multiple: 2, verdadero_falso: 2 },
    });

    expect(r.tipo).toBe('examen');
    const preguntas = r.contenido_json?.preguntas;
    expect(preguntas, 'Tiene preguntas').toBeTruthy();
    expect(preguntas.length, 'Tiene al menos 2 preguntas').toBeGreaterThanOrEqual(2);
    preguntas.forEach((p) => {
      expect(p.enunciado, 'Pregunta tiene enunciado').toBeTruthy();
      expect(p.tipo, 'Pregunta tiene tipo').toBeTruthy();
    });
    const clave = r.clave_respuestas?.preguntas;
    expect(clave?.length, 'Clave de respuestas tiene entradas').toBeGreaterThan(0);
    console.log(`  ✓ ${preguntas.length} preguntas, tipos: ${[...new Set(preguntas.map(p => p.tipo))].join(', ')}`);
  });

  // ─── Para colorear ─────────────────────────────────────────────────────────
  test('para_colorear — genera prompt y puede generar imagen', async ({ request }) => {
    const r = await generateHerramienta(request, token, {
      tipo: 'para_colorear',
      tema: 'Un elefante en la selva',
      nivel: 'basico',
      grado: '3',
      description_imagen: 'Un elefante amigable en la selva con árboles y flores',
    });

    expect(r.tipo).toBe('para_colorear');
    const pc = r.contenido_json?.para_colorear;
    expect(pc, 'contenido_json.para_colorear existe').toBeTruthy();
    expect(pc.image_prompt, 'Tiene image_prompt en inglés').toBeTruthy();
    expect(pc.image_prompt.length, 'image_prompt tiene al menos 20 chars').toBeGreaterThan(20);
    console.log(`  ✓ prompt: "${pc.image_prompt.slice(0, 80)}..."`);
    console.log(`  ✓ imagen_url: ${pc.imagen_url ? 'generada (' + pc.imagen_url.slice(0, 40) + '...)' : 'vacía (sin clave DALL-E/Cloudflare)'}`);
  });
});
