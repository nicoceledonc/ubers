import * as dotenv from 'dotenv';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import dayjs from 'dayjs';
import { appendFileSync, writeFileSync } from 'fs';

puppeteer.use(StealthPlugin());

dotenv.config();
const pickup = process.env.PICKUP;
const drop = process.env.DROP;
const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const SCAN_PERIOD = 60 * 1000;

const removeNbsp = (text) => {
  return text.replace(/ /g, ' ');
};

writeFileSync('./record.csv', 'timestamp,type,price\n');

// Iniciar puppeteer
await puppeteer
  .launch({ headless: false, executablePath: executablePath() })
  .then(async (browser) => {
    const page = await browser.newPage();

    // Acceder a Uber
    await page.goto('https://m.uber.com');

    await page.waitForSelector('button p');
    const res = await page.$$('button p');

    // Promesa para manejar popup de google
    const googlePopupPagePromise = new Promise((x) => page.once('popup', x));

    // Buscar y click en botón de google
    let i;
    for (i in res) {
      let textContent = await res[i].evaluate((el) => el.textContent);
      textContent = removeNbsp(textContent);
      const continueList = ['Continue with Google', 'Continúa con Google'];
      if (continueList.includes(textContent) === true) {
        res[i].click();
      }
    }

    // Popup de google
    const googlePopupPage = await googlePopupPagePromise;

    // Ingreso de correo
    await googlePopupPage.waitForSelector('input[type="email"]');
    await googlePopupPage.type('input[type="email"]', email);

    // Click en botón Siguiente
    await googlePopupPage.waitForXPath('//span[text()="Siguiente"]');
    (await googlePopupPage.$x('//span[text()="Siguiente"]'))[0].click();

    await new Promise((r) => setTimeout(r, 2 * 1000));

    // Ingreso de correo
    await googlePopupPage.waitForSelector('input[type="password"]');
    await googlePopupPage.type('input[type="password"]', password);

    // Click en botón Siguiente
    await googlePopupPage.waitForXPath('//span[text()="Siguiente"]');
    (await googlePopupPage.$x('//span[text()="Siguiente"]'))[0].click();

    let xPathSelector;
    let cssSelector;

    // Ingresar Origen
    await page.waitForSelector('input[data-inputkey="pickup"]');
    await new Promise((r) => setTimeout(r, 2 * 1000));
    await page.type('input[data-inputkey="pickup"]', pickup);
    await new Promise((r) => setTimeout(r, 3 * 1000));
    xPathSelector = `//p[text()="${pickup.split(',')[0]}"]`;
    await page.waitForXPath(xPathSelector);
    (await page.$x(xPathSelector))[0].click();

    let timestampMark = Date.now();
    // Cambiar el destino para recalcular precio
    for (let iter = 0; iter < 24 * 60; iter++) {
      // Destino
      await page.waitForSelector('input[data-inputkey="drop"]');
      await new Promise((r) => setTimeout(r, 2 * 1000));
      await page.type('input[data-inputkey="drop"]', drop);
      await new Promise((r) => setTimeout(r, 3 * 1000));
      xPathSelector = `//p[text()="${drop.split(',')[0]}"]`;
      await page.waitForXPath(xPathSelector);
      (await page.$x(xPathSelector))[0].click();

      // Obtener datos de tarifas
      cssSelector =
        '[data-tracking-name="select_product"] div[data-baseweb="block"] div[data-baseweb="typo-labellarge"]';
      await page.waitForSelector(cssSelector);
      const tripData = await page.$$(cssSelector);
      const tripType = await tripData[0].evaluate((el) => el.textContent);
      const tripPrice = removeNbsp(
        await tripData[1].evaluate((el) => el.textContent)
      )
        .split(' ')[1]
        .replace(',', '');

      await new Promise((r) => setTimeout(r, 2 * 1000));

      // Borrar destino
      await page.click('input[data-inputkey="drop"]');
      for (let i = 0; i < drop.length; i++) {
        await page.keyboard.press('Backspace');
      }

      const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
      console.log(`${timestamp},${tripType},${tripPrice}`);
      appendFileSync('./record.csv', `${timestamp},${tripType},${tripPrice}\n`);
      await new Promise((r) =>
        setTimeout(r, SCAN_PERIOD - (Date.now() - timestampMark))
      );
      timestampMark = Date.now();
    }

    // Cerrar navegador
    await browser.close();
  });
