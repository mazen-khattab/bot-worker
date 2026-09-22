// mazenhomei123@gmail.com
// &3#$$as@P-H%?Hr

require("dotenv").config();
const { chromium } = require("playwright");
const { google } = require("googleapis");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

// إعدادات الجوجل شيت
const SPREADSHEET_ID = "11VJ8XG66CRTBLfIdaqDZ-XDf4-G_5T-l68vXS_1iFVo"; // بتجيبه من لينك الشيت نفسه
const SHEET_NAME = "Sheet1"; // اسم التبويب جوة الشيت
const COOKIE_SHEET_NAME = "user_cookies";

const logFilePath = path.join(__dirname, "bot.log");
const MAX_MESSAGES_PER_DAY = 25;
const MAX_RETRIES = 3;

// نظام الـ Logging
function log(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(logFilePath, logMessage, "utf-8");
}

const delay = (min, max) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)),
  );

// دالة لجعل الـ Node.js تنتظر ضغطة زرار من المستخدم في الـ Terminal
function askTextInput(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  log(query);

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

// الاتصال بـ Google Sheets API
function getSheetsClient() {
  if (
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  ) {
    log("🔑 Using Environment Variables for Google Cloud Auth...");
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    return google.sheets({ version: "v4", auth });
  }

  log("📂 Using local credentials.json file for Google Cloud Auth...");
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, "credentials.json"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function runBot() {
  log("🚀 Running the fully cloud-connected advanced bot...");
  const sheets = getSheetsClient();

  // 1. Fetch the cookies from the Google Sheet (if any) to use in the browser context
  let storedCookiesJson = null;
  try {
    // Use the spreadsheetId and range to get the cookies from the specific cell in the cookie sheet
    const cookieResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${COOKIE_SHEET_NAME}!A2`, // الكوكيز مخزنة في السطر التاني
    });

    // If the cell has data, store it in storedCookiesJson
    if (cookieResponse.data.values && cookieResponse.data.values[0]) {
      storedCookiesJson = cookieResponse.data.values[0][0];
    }
  } catch (err) {
    log(
      `⚠️ Cookie tab failed to read (may be empty the first time): ${err.message}`,
      "WARN",
    );
  }

  // 2. Fetch the main data sheet to get the list of profiles and messages
  let rows = [];
  try {
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:C`,
    });
    rows = dataResponse.data.values || [];
  } catch (apiError) {
    log(
      `❌ Failed to connect to Google Sheet to fetch data: ${apiError.message}`,
      "ERROR",
    );
    return;
  }

  if (rows.length <= 1) {
    log("⚠️ The data sheet is completely empty or contains only the header.");
    return;
  }

  const headers = rows[0];
  const profileLinkIdx = headers.indexOf("Profile Links");
  const statusIdx = headers.indexOf("Status");
  const aiMessageIdx = headers.indexOf("AI Message");

  if (profileLinkIdx === -1 || statusIdx === -1 || aiMessageIdx === -1) {
    log(
      "❌ The headers in the data sheet are incorrect! They should be: (Profile Links, Status, AI Message)",

      "ERROR",
    );
    return;
  }

  let messagesSentToday = rows.filter(
    (row) => row[statusIdx] === "Completed",
  ).length;

  log(
    `📊 Sheet checked: ${messagesSentToday} today's message was sent earlier.`,
  );

  if (messagesSentToday >= MAX_MESSAGES_PER_DAY) {
    log(
      `🛑 The maximum allowed for today has already been reached (${MAX_MESSAGES_PER_DAY}). The bot has stopped.`,

      "WARN",
    );
    return;
  }

  // 3. تشغيل المتصفح (عادي بدون Persistent Context محلي لأننا بنحكم في الكوكيز يدوياً)
  const browser = await chromium.launch({
    // headless: storedCookiesJson ? true : false, // لو مفيش كوكيز هيفتح جرافيكال عشان تسجل دخول، لو فيه هيشتغل صامت أوتوماتيك
    headless: false,
    args: [
      "--disable-notifications",
      "--blink-settings=imagesEnabled=false",
      // 🚨 الـ 3 سطور الجايين دول "حياة أو موت" على سيرفرات Ubuntu عشان المتصفح مايكرش
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // بيمنع الـ Crash اللي بيحصل بسبب امتلاء الـ Shared Memory
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  // 4. الـ Logic الذكي للكوكيز (حقن أو تسجيل دخول)
  if (storedCookiesJson && storedCookiesJson.trim() !== "") {
    log(
      "🔒 Cookies were found in the Google Sheet. They are being implanted in the browser...",
    );
    try {
      const cookiesArray = JSON.parse(storedCookiesJson);
      await context.addCookies(cookiesArray);
      log("✅ Cookies were successfully planted.");
    } catch (e) {
      log(
        `❌ Failed to parse cookie text: ${e.message}. A new login will be requested.`,

        "ERROR",
      );
      storedCookiesJson = null;
    }
  }

  const page = await context.newPage();

  // If no cookies were found or they were invalid, prompt the user to log in manually, and then save the new cookies to the Google Sheet
  if (!storedCookiesJson) {
    log("🔑 The cookie sheet is empty. Opening Facebook for manual login...");
    await page.goto("https://www.facebook.com", {
      waitUntil: "domcontentloaded",
    });

    console.log("\n📢 [Required Action]: Your browser is now open.");

    console.log("1. Manually log in to Facebook and complete 2FA if required.");

    console.log(
      "2. Once you are on the Home page, return here and press Enter.",
    );

    await askTextInput(
      "⌨️ Press [Enter] here in the Terminal immediately after successfully logging in...",
    );

    log(
      "💾 New cookies are being retrieved from the browser and saved to Google Sheets...",
    );
    const freshCookies = await context.cookies();
    const freshCookiesStr = JSON.stringify(freshCookies);

    // حفظ الكوكيز أونلاين في الخلية A2
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${COOKIE_SHEET_NAME}!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[freshCookiesStr]] },
    });
    log(
      "✅ Cookies have been successfully saved to the cloud in the sheet. Next time they will work completely automatically and silently.",
    );
  }

  // 5. Send the messages to the profiles in the sheet
  // for (let i = 1; i < rows.length; i++) {
  //   // Retrieve the second row after the header (index 1) and get the profile URL, current status, and AI message
  //   const row = rows[i];
  //   const profileUrl = row[profileLinkIdx];
  //   const currentStatus = row[statusIdx];
  //   const aiMessage = row[aiMessageIdx];

  //   if (currentStatus === "Completed" || currentStatus === "Failed") continue;

  //   // Check if the daily limit has been reached
  //   if (messagesSentToday >= MAX_MESSAGES_PER_DAY) {
  //     log(
  //       `🛑 We have reached the maximum daily limit allowed today (${MAX_MESSAGES_PER_DAY}). Stopping...`,

  //       "WARN",
  //     );
  //     break;
  //   }

  //   // Check if the profile URL or AI message is missing
  //   if (!profileUrl || !aiMessage) {
  //     log(
  //       `⚠️ Line ${i + 1} is missing the link or AI message. Skip...`,

  //       "WARN",
  //     );
  //     continue;
  //   }

  //   let attempt = 0;
  //   let success = false;

  //    while (attempt < MAX_RETRIES && !success) {
  //     attempt++;
  //     try {
  //       log(
  //         `🔗 [Attempt ${attempt}/${MAX_RETRIES}] Moving to profile: ${profileUrl}`,
  //       );
  //       await page.goto(profileUrl, {
  //         waitUntil: "domcontentloaded",
  //         timeout: 45000,
  //       });

  //       // فتح صندوق الرسالة بـ aria-label
  //       const messageButton = page
  //         .locator('div[aria-label="Message"], div[aria-label="إرسال رسالة"]')
  //         .first();

  //       // صندوق كتابة المسنجر الحصري (اللي بيبدأ بـ Write to أو اكتب إلى)
  //       const messengerTextBox = page
  //         .locator(
  //           'div[role="textbox"][aria-label^="Write to"], div[role="textbox"][aria-label^="Write a message"], div[role="textbox"][aria-label^="اكتب إلى"], div[role="textbox"][aria-label^="مراسلة"]',
  //         )
  //         .first();

  //       await messageButton.waitFor({ state: "visible", timeout: 15000 });

  //       let isChatOpened = false;
  //       let clickAttempts = 0;

  //       // 🔄 حلقة تكرار لإجبار فيسبوك على فتح الصندوق (بحد أقصى 3 محاولات ضغط)
  //       while (!isChatOpened && clickAttempts < 3) {
  //         clickAttempts++;
  //         log(
  //           `⚡ Attempting to press the message button... (Attempt: ${clickAttempts})`,
  //         );

  //         if (clickAttempts === 1) {
  //           await messageButton.click(); // الضغطة العادية الأولى
  //         } else if (clickAttempts === 2) {
  //           await messageButton.click({ force: true }); // ضغطة إجبارية في حال وجود عنصر مغطي عليه
  //         } else {
  //           // الضغطة الثالثة القاضية عبر الـ JavaScript مباشرة في المتصفح (تتخطى أي مشاكل في الـ UI)
  //           await messageButton.evaluate((el) => el.click());
  //         }

  //         // انتظر ثواني قليلة ونشوف هل صندوق المسنجر ظهر وبقى مرئي؟
  //         try {
  //           await messengerTextBox.waitFor({ state: "visible", timeout: 4000 });
  //           isChatOpened = true; // لو نجح في الانتظار بدون خطأ، يبقى الشات فتح!
  //           log(
  //             "🎯 Confirmation: The Messenger box has been successfully and powerfully opened!",
  //           );
  //         } catch (e) {
  //           log(
  //             "⚠️ Chat hasn't opened yet. Please try clicking harder...",

  //             "WARN",
  //           );
  //           await delay(2000, 2000);
  //         }
  //       }

  //       // 🚨 لو استنفد محاولات الضغط والشات برضه ما فتحش، تخطي البروفايل ده فوراً
  //       if (!isChatOpened) {
  //         log(
  //           `❌ Failed to open the message box for this profile after several attempts. It will be skipped and updated to 'Failed'.`,
  //           "ERROR",
  //         );

  //         const columnLetter = String.fromCharCode(65 + statusIdx);
  //         await sheets.spreadsheets.values.update({
  //           spreadsheetId: SPREADSHEET_ID,
  //           range: `${SHEET_NAME}!${columnLetter}${i + 1}`,
  //           valueInputOption: "USER_ENTERED",
  //           requestBody: { values: [["Failed"]] },
  //         });
  //         success = false;
  //         break; // يخرج من الـ while loop بتاعة الـ Retries وينقل على البروفايل التالي
  //       }

  //       // 2. التركيز والكتابة (بما إننا متأكدين 100% إن الصندوق فتح)
  //       await messengerTextBox.focus();

  //       log(`✍️ The AI is currently writing a message that mimics humans...`);
  //       for (let char of aiMessage) {
  //         await page.keyboard.type(char);
  //         await delay(80, 200);
  //       }

  //       // تفريغ الإرسال التلقائي
  //       await page.keyboard.press("Enter");

  //       await delay(8000, 10000);

  //       log(`✅ Message successfully sent to: ${profileUrl}`);

  //       // تحديث فوري أونلاين على جوجل شيت عند النجاح
  //       const columnLetter = String.fromCharCode(65 + statusIdx);
  //       await sheets.spreadsheets.values.update({
  //         spreadsheetId: SPREADSHEET_ID,
  //         range: `${SHEET_NAME}!${columnLetter}${i + 1}`,
  //         valueInputOption: "USER_ENTERED",
  //         requestBody: { values: [["Completed"]] },
  //       });
  //       log(
  //         `💾 The online sheet for line ${i + 1} has been updated to 'Completed'.`,
  //       );

  //       messagesSentToday++;
  //       success = true;

  //       // إغلاق شات المسنجر الصغير لتنظيف الصفحة
  //       const closeButton = page
  //         .locator(
  //           'div[aria-label="Close chat"], div[aria-label="إغلاق الدردشة"]',
  //         )
  //         .first();
  //       if (await closeButton.isVisible()) {
  //         await closeButton.click();
  //       }

  //       // انتظار أمان عشوائي طويل (من 1 لـ 1.5 دقائق) لحماية الحساب من الحظر
  //       const sleepTime = Math.floor(
  //         Math.random() * (90000 - 60000 + 1) + 60000,
  //       );
  //       log(
  //         `⏳ Waiting for ${(sleepTime / 1000 / 60).toFixed(2)} minutes before the next profile...`,
  //       );
  //       await delay(sleepTime, sleepTime);
  //     } catch (error) {
  //       log(
  //         `❌ Error in attempt ${attempt} for profile ${profileUrl}: ${error.message}`,
  //         "ERROR",
  //       );

  //       if (attempt >= MAX_RETRIES) {
  //         // تحديث فوري أونلاين في حالة الفشل النهائي بعد الـ Retries
  //         const columnLetter = String.fromCharCode(65 + statusIdx);
  //         await sheets.spreadsheets.values.update({
  //           spreadsheetId: SPREADSHEET_ID,
  //           range: `${SHEET_NAME}!${columnLetter}${i + 1}`,
  //           valueInputOption: "USER_ENTERED",
  //           requestBody: { values: [["Failed"]] },
  //         });
  //         log(
  //           `💀 All attempts failed. Status for line ${i + 1} has been updated to 'Failed' online.`,
  //           "ERROR",
  //         );
  //       } else {
  //         log("⏳ Waiting 15 seconds before retrying...", "WARN");
  //         await delay(15000, 15000);
  //       }
  //     }
  //   }
  // }

  // 5. Send the messages to the profiles in the sheet
  for (let i = 1; i < rows.length; i++) {
    // Retrieve the second row after the header (index 1) and get the profile URL, current status, and AI message
    const row = rows[i];
    const profileUrl = row[profileLinkIdx];
    const currentStatus = row[statusIdx];
    const aiMessage = row[aiMessageIdx];

    if (currentStatus === "Completed" || currentStatus === "Failed") continue;

    // Check if the daily limit has been reached
    if (messagesSentToday >= MAX_MESSAGES_PER_DAY) {
      log(
        `🛑 We have reached the maximum daily limit allowed today (${MAX_MESSAGES_PER_DAY}). Stopping...`,
        "WARN",
      );

      break;
    }

    // Check if the profile URL or AI message is missing
    if (!profileUrl || !aiMessage) {
      log(
        `⚠️ Line ${i + 1} is missing the link or AI message. Skip...`,
        "WARN",
      );

      continue;
    }

    let attempt = 0;
    let success = false;

    while (attempt < MAX_RETRIES && !success) {
      attempt++;
      // const targetPage = await context.newPage();

      try {
        log(
          `🔗 [Attempt ${attempt}/${MAX_RETRIES}] Moving to profile: ${profileUrl}`,
        );

        await page.goto(profileUrl, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });

        // 🆕 خطوة 1: لقط اسم صاحب البروفايل الحالي عشان نعمل بيه Validation
        // فيسبوك بيحط اسم الشخص في عنوان الصفحة أو في أول h1
        await page.waitForSelector("h1", { timeout: 10000 });
        const profileName = await page.locator("h1").first().innerText();
        const cleanName = profileName.trim();

        log(`👤 Target Profile Name detected: "${cleanName}"`);

        // فتح صندوق الرسالة
        const messageButton = page
          .locator('div[aria-label="Message"], div[aria-label="إرسال رسالة"]')
          .first();

        await messageButton.waitFor({ state: "visible", timeout: 15000 });

        let isChatOpened = false;
        let clickAttempts = 0;
        let messengerTextBox = null;

        // 🔄 حلقة فتح الشات والتأكد من هوية العميل
        while (!isChatOpened && clickAttempts < 4) {
          clickAttempts++;

          log(`⚡ Pressing message button... (Attempt: ${clickAttempts})`);

          if (clickAttempts === 1) await messageButton.click();
          else if (clickAttempts === 2)
            await messageButton.click({ force: true });
          else await messageButton.evaluate((el) => el.click());

          await delay(3000, 4000); // استراحة صغيرة عشان الـ UI يلحق يفتح

          // 🆕 خطوة 2: هنمسك كل صناديق التكست بوكس المفتوحة ونشوف مين فيهم اللي يخص العميل بتاعنا
          const boxes = page.locator('div[role="textbox"]');
          const boxCount = await boxes.count();

          log(`The count of box has role="textbox": ${boxCount}`);

          for (let b = 0; b < boxCount; b++) {
            const currentBox = boxes.nth(b);
            const ariaLabel =
              (await currentBox.getAttribute("aria-label")) || "";

            // التشيك الذكي: لو الـ aria-label جواه اسم العميل الحالي (سواء عربي أو إنجليزي)
            if (
              ariaLabel.toLowerCase().includes(cleanName.toLowerCase()) &&
              (ariaLabel.startsWith("Write to") ||
                ariaLabel.startsWith("اكتب إلى"))
            ) {
              log(`${cleanName}'s messenger box has opened successfully ✅`);

              messengerTextBox = currentBox;
              isChatOpened = true;
              break;
            }
          }

          // لو لقانا شات مفتوح بس مش باسم العميل الحالي، نقفله فوراً لإن ده "شات معلق" من البروفايل القديم
          if (!isChatOpened) {
            log(
              "⚠️ Detected a hanging chatbox from a previous profile or wrong user. Cleaning up...",
              "WARN",
            );

            const closeButton = page
              .locator(
                'div[aria-label="Close chat"], div[aria-label="إغلاق الدردشة"]',
              )
              .first();
            if (await closeButton.isVisible()) {
              await closeButton.click();
              await delay(2000, 2000);
            }
          }
        }

        // لو بعد كل ده معرفش يفتح الصندوق الصح للشخص الصح
        if (!isChatOpened || !messengerTextBox) {
          log(
            `❌ Security Breach: Could not isolate the correct chatbox for "${cleanName}". Skipping to prevent sending to wrong person.`,
            "ERROR",
          );

          const columnLetter = String.fromCharCode(65 + statusIdx);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!${columnLetter}${i + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [["Failed"]] },
          });

          // await page.close();
          success = false;
          break;
        }

        // 3. التركيز والكتابة في الصندوق الصح المضمون 100%
        await messengerTextBox.focus();
        log(`✍️ Writing human-like message strictly to "${cleanName}"...`);

        for (let char of aiMessage) {
          await page.keyboard.type(char);
          await delay(80, 200);
        }

        await page.keyboard.press("Enter");
        await delay(8000, 10000);

        log(`✅ Message successfully sent to: ${cleanName} (${profileUrl})`);

        // تحديث شيت جوجل
        const columnLetter = String.fromCharCode(65 + statusIdx);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${columnLetter}${i + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [["Completed"]] },
        });
        log(`💾 Sheet updated to 'Completed' for line ${i + 1}.`);

        // messagesSentToday++;
        // success = true;

        // await page.close();

        // const sleepTime = Math.floor(
        //   Math.random() * (60000 - 45000 + 1) + 45000,
        // );
        // log(`⏳ Waiting for ${(sleepTime / 1000 / 60).toFixed(2)} minutes...`);
        // await delay(sleepTime, sleepTime);
        messagesSentToday++;
        success = true;

        await delay(3000, 4000);
        log(`🧹 Starting strict cleanup to close the chat window...`);

        // إغلاق شات المسنجر الصغير لتنظيف الصفحة
        const closeButton = page
          .locator(
            'div[aria-label="Close chat"], div[aria-label="إغلاق الدردشة"], div[role="button"][aria-label^="Close"], div[role="button"][aria-label^="إغلاق"]',
          )
          .first();

        // 🆕 حلف كود القفل جوة try...catch مستقل عشان نضمن استمرار البوت لو القفل عصلج
        try {
          await closeButton.waitFor({ state: "visible", timeout: 5000 });

          // الكليك القاضية بـ evaluate
          await closeButton.evaluate((el) => el.click());
          log("✅ Chat window successfully closed and cleaned from DOM.");
          await delay(2000, 2000);
        } catch (timeoutError) {
          // 🆕 لو الـ 5 ثواني خلصوا والزرار مظهرش، هندخل هنا فوراً
          log(
            "⚠️ Close button didn't appear within 5s. Executing fallback page reload...",
            "WARN",
          );

          // ريفريش صارم للصفحة عشان نضمن تدمير أي الـ Chat components معلقة في الـ DOM
          await page.reload({
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          log(
            "🔄 Page reloaded successfully to clear any hanging chat windows.",
          );
          await delay(3000, 3000);
        }

        // انتظار أمان عشوائي طويل (من 1 لـ 1.5 دقائق) لحماية الحساب من الحظر
        const sleepTime = Math.floor(
          Math.random() * (60000 - 45000 + 1) + 45000,
        );
        log(
          `⏳ Waiting for ${(sleepTime / 1000 / 60).toFixed(2)} minutes before the next profile...`,
        );
        await delay(sleepTime, sleepTime);
      } catch (error) {
        log(
          `❌ Error in attempt ${attempt} for profile ${profileUrl}: ${error.message}`,
          "ERROR",
        );
        // await page.close();

        if (attempt >= MAX_RETRIES) {
          const columnLetter = String.fromCharCode(65 + statusIdx);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!${columnLetter}${i + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [["Failed"]] },
          });
        } else {
          log("⏳ Waiting 15 seconds before retrying...", "WARN");
          await delay(15000, 15000);
        }
      }
    }
  }

  await browser.close();
  log("🏁 All tasks completed successfully and the bot has been closed.");
}

runBot();