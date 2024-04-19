import puppeteer from "puppeteer"
import NextCaptcha from "nextcaptcha-ts";
import _ from 'lodash';

const url = 'https://store.steampowered.com/join';

function main() {
  puppeteer.launch({
    headless: true,
  }).then(async browser => {
    const clientKey = process.env.NEXTCAPTCHA_KEY || '';
    const client = new NextCaptcha(clientKey);
    let clientConfig: any;
    if (process.argv.length < 3) throw Error('Usage: register.ts <email>');
    const [email, password] = process.argv.slice(2);
    const page = await browser.newPage();

    page.on('response', async response => {
        if ( response.url().includes('/join/ajaxverifyemail')) {
          console.log(await response.json())
          const data = await response.json();
          if (data.success === 1) {
            console.log('register success, please check your email')
          } else {
            console.log('register fail: ', data)
          }
          process.exit(0);
        }
    })

    await page.goto('https://store.steampowered.com/join', {
      waitUntil: 'networkidle0',
    });

    clientConfig = (await page.evaluate(() => {

      function findCaptchaInfo(widget: any) {
          let result: any = {};
          function recurse(obj: any) {
            if (Object.entries(result).length === 3) return;
            for (let key in obj) {
              if (key === 'sitekey' || key === 's' || key === 'action') {
                result[key] = obj[key];
              } else if ((Object.prototype.toString.call(obj[key]) === '[object Object]')) {
                recurse(obj[key]);
              }
            }
        }
        recurse(widget);
        return result;
      }

      return new Promise<any[]>(resolve => {
        let times = 30;
        const id = setInterval(() => {
          if (times < 0) resolve([]);
          times--;
          // @ts-ignore
          if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
            const res: any = [];
            // @ts-ignore
            Object.entries(window.___grecaptcha_cfg.clients).forEach((widget: [string, any])=> {
              res.push(findCaptchaInfo(widget[1]));
            })
            clearInterval(id);
            resolve(res);
          }
        }, 1000)
      })

    }))?.[0];
    if (_.isEmpty(clientConfig)) {
      console.error('get captcha config error')

    }
    await page.setViewport({width: 1080, height: 1024});
    const emailInput = await page.waitForSelector('#email');
    await emailInput?.focus();
    await emailInput?.type(email);
    const confirmEmailInput = await page.waitForSelector('#reenter_email');
    await confirmEmailInput?.focus();
    await confirmEmailInput?.type(email);
    const checkbox = await page.waitForSelector('#i_agree_check');
    await checkbox?.click()
    const token = await client.recaptchaV2Enterprise({
      websiteKey: clientConfig?.sitekey,
      websiteURL: url,
      // pageAction: clientConfig?.action,
      // isInvisible: false,
      enterprisePayload: {
        s: clientConfig?.s as string
      } as any
    });
    await page.evaluate((gRecaptchaResponse) => {
      document.querySelector<HTMLTextAreaElement>('[name="g-recaptcha-response"]')!.value = gRecaptchaResponse;
      document.querySelector<HTMLTextAreaElement>('[name="g-recaptcha-response"]')!.innerText = gRecaptchaResponse;
    }, token.solution.gRecaptchaResponse);
    const registerBtn = await page.waitForSelector('#createAccountButton');
    await registerBtn?.click()
    await browser.close()
  }).catch(err => {
    console.log(err);
    process.exit(0)
  })
}

main()