const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const SHOTS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

let idx = 0;
async function shot(page, name) {
  idx++;
  const p = path.join(SHOTS, `${String(idx).padStart(2,'0')}_${name}.png`);
  await page.screenshot({ path: p });
  console.log(`  📸 ${path.basename(p)}`);
}

async function nextStep(page) {
  // botón "Siguiente" o "Continuar" dentro del modal
  const btn = page.locator('button').filter({ hasText: /siguiente|continuar/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
  await page.waitForTimeout(600);
}

(async () => {
  // limpiar screenshots anteriores
  fs.readdirSync(SHOTS).forEach(f => fs.unlinkSync(path.join(SHOTS, f)));

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120_000);

  try {
    // ─── LOGIN ────────────────────────────────────────────────────────────
    console.log('\n1. Login');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"], input[name="correo"]').first().fill('admin@xcalificator.com');
    await page.locator('input[type="password"]').first().fill('Admin123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
    await shot(page, 'dashboard');
    console.log('  OK');

    // ─── HERRAMIENTAS ─────────────────────────────────────────────────────
    console.log('\n2. Herramientas existentes');
    await page.goto(`${BASE}/profesor/herramientas`);
    await page.waitForLoadState('networkidle');
    await shot(page, 'herramientas_lista');

    // ─── ABRIR MODAL ─────────────────────────────────────────────────────
    console.log('\n3. Abriendo modal "Generar con IA"');
    await page.locator('button').filter({ hasText: /generar con ia/i }).first().click();
    await page.waitForTimeout(800);
    await shot(page, 'modal_paso1_tipos');

    // ─── HELPER: generar una herramienta ─────────────────────────────────
    async function generarHerramienta(tipoTexto, tema, extra = {}) {
      console.log(`\n  → Generando ${tipoTexto}`);

      // Paso 1: seleccionar tipo
      await page.locator('button').filter({ hasText: /generar con ia/i }).first().click().catch(() => {});
      await page.waitForTimeout(500);

      // clic exacto en la card del tipo
      await page.locator(`text="${tipoTexto}"`).first().click();
      await page.waitForTimeout(300);

      // Llenar título
      const titulo = page.locator('input[placeholder*="título" i], input[placeholder*="titulo" i]').first();
      if (await titulo.isVisible()) await titulo.fill(`${tipoTexto}: ${tema}`);

      // Llenar tema
      const temaInput = page.locator('textarea[placeholder*="tema" i], input[placeholder*="tema" i], textarea').first();
      if (await temaInput.isVisible()) await temaInput.fill(tema);

      await shot(page, `${tipoTexto.toLowerCase().replace(/ /g,'_')}_paso1`);
      await nextStep(page); // → Paso 2 Ajustes
      await shot(page, `${tipoTexto.toLowerCase().replace(/ /g,'_')}_paso2`);
      await nextStep(page); // → Paso 3 Generar
      await shot(page, `${tipoTexto.toLowerCase().replace(/ /g,'_')}_paso3`);

      // Clic en botón final de generar (paso 3)
      const genBtn = page.locator('button').filter({ hasText: /^generar$/i }).first();
      if (await genBtn.isVisible()) {
        await genBtn.click();
      } else {
        // Si ya generó directamente
        const altBtn = page.locator('button').filter({ hasText: /generar herramienta/i }).first();
        if (await altBtn.isVisible()) await altBtn.click();
      }

      console.log(`    Esperando resultado...`);
      // Esperar que desaparezca el spinner/loading
      await page.waitForFunction(
        () => !document.querySelector('[class*="animate-spin"], [class*="loading"]'),
        { timeout: 180_000 }
      ).catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, `${tipoTexto.toLowerCase().replace(/ /g,'_')}_resultado`);

      // Scroll para ver más del resultado
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(400);
      await shot(page, `${tipoTexto.toLowerCase().replace(/ /g,'_')}_resultado_scroll`);
      console.log(`    OK ✓`);
    }

    // ─── GENERAR CRUCIGRAMA ───────────────────────────────────────────────
    await generarHerramienta('Crucigrama', 'Los planetas del sistema solar');

    // ─── GENERAR SOPA DE LETRAS ───────────────────────────────────────────
    await generarHerramienta('Sopa de Letras', 'Los animales de la selva');

    // ─── GENERAR EXAMEN ───────────────────────────────────────────────────
    await generarHerramienta('Examen', 'La fotosíntesis en las plantas');

    console.log('\n✅ Capturas guardadas en:', SHOTS);
    console.log('   Total:', fs.readdirSync(SHOTS).length, 'imágenes');

    await page.waitForTimeout(3000);
  } catch (e) {
    console.error('\n❌ Error:', e.message);
    await shot(page, 'error');
  } finally {
    await browser.close();
  }
})();
