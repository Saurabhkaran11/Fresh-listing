# Connect Fresh Listings Saver to Google Drive

1. Open [Google Apps Script](https://script.google.com/) while signed in to the same Google account that owns the Job Archive.
2. Create a project, replace the starter file with `Code.gs`, and change `ARCHIVE_SECRET` to a long, private value.
3. Deploy it as a **Web app**. Run it as **you** and grant access only to the Google account(s) that will use the extension. Keep that account signed in in your browser.
4. Copy the deployment URL ending in `/exec`.
5. In the extension, open **Connection settings**, paste the web-app URL and the same secret, then save.

The extension now appends each job you explicitly save, including title, company, source, location, posting time, capture time, originating search, and the direct job link. Keep the deployment URL and secret private.
