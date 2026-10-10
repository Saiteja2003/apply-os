# ApplyOS Clipper

Sends the job posting you are looking at to your ApplyOS pipeline, so you
never copy and paste a job description. Two forms, same extraction code
(`extract.js`).

Both rely on you being signed in to ApplyOS in the same browser.

## Chrome extension (Manifest V3)

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** and choose this folder (`packages/clipper`).
3. On a job posting, click the extension, check the company and role, and
   press **Import to ApplyOS**.

It posts to `POST /api/ingest` and shows "Imported & Tailoring Initiated!".
Tailoring then runs on the server; the card appears in the pipeline on its
next load.

The default address is `http://localhost:3000`. To use a deployed ApplyOS,
open **ApplyOS address** in the popup, enter the URL, and allow access when
Chrome asks.

## Bookmarklet

1. Build it for your ApplyOS address:

   ```bash
   node packages/clipper/build-bookmarklet.mjs https://your-applyos.example
   ```

2. Create a bookmark and paste the contents of `bookmarklet.txt` as its URL.
3. On a job posting, click the bookmark. ApplyOS opens in a new tab with the
   captured job for you to confirm; nothing is saved until you press Import.

## Locking the API to your extension

By default `/api/ingest` accepts requests from any browser extension that
holds permission for your ApplyOS address (the session cookie still has to
be valid). To accept only this one, copy its ID from `chrome://extensions`
and set, in `.env.local` or your host's environment:

```
CLIPPER_EXTENSION_ORIGINS=chrome-extension://<extension-id>
```

## What it reads

In order: the `JobPosting` data most career sites publish for search
engines, then selectors for LinkedIn, Greenhouse, Lever and Ashby, then your
text selection (select the description first on a site it does not know),
then the page's main content. Lists keep their bullets (`• `), HTML entities
are decoded, and extra whitespace is collapsed. On LinkedIn the visible job
card wins over page metadata, and a `/jobs/collections/...?currentJobId=`
page is saved as its `/jobs/view/<id>/` link. Site markup changes; if a field comes out
wrong, fix it in the popup or on the confirmation page.
