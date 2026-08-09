# Fresh Listings Manual Saver

This extension is a user-assisted save form. It does not open, scrape, automate, or inject code into LinkedIn, Indeed, Built In, Glassdoor, Greenhouse, TrueUp, or any other job portal.

1. Download and unzip `fresh-listings-extension.zip` from Fresh Listings.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**, select **Load unpacked**, and choose the unzipped `extension/fresh-listings` folder.
4. Follow `google-apps-script/SETUP.md` once, then open **Connection settings** and add the private Apps Script URL and secret.
5. Open a job page yourself, copy its title, company, location, posting age, and URL, then paste those details into the helper and select **Save job to Drive**.

The helper sends only the fields you entered to your own Google Apps Script archive. It never receives portal passwords, cookies, MFA codes, or CAPTCHA tokens.
