# FormData Extract

Extract printed PDF and image forms using the OpenAI API. Every file becomes one spreadsheet row, every extracted field becomes a column, and **File name** contains the original filename including its extension. Review/edit values, add missing columns, and download CSV or Excel.

## Configure your OpenAI API key and run

1. Copy `.env.example` to `.env` in this directory (only if `.env` does not already exist).
2. Edit `.env` locally:

   ```dotenv
   OPENAI_API_KEY=your-real-openai-api-key
   OPENAI_MODEL=gpt-5.6-luna
   ```

3. Build and start:

   ```powershell
   docker compose up --build -d
   ```

4. Open **http://localhost:8086**.

Image and container name: **formdataextract**. Host and container port: **8086**.

The key stays in server configuration and is never returned to the browser. `.env` is excluded from Git and the Docker build context. Keep it private. Shell environment variables override `.env` when using Compose. After changing `.env`, run `docker compose up -d` to recreate the service with the new settings; a simple restart does not reload its environment.

If the key is missing, the app still starts and shows setup instructions. Extraction requires a valid API key, API billing/quota, network access to OpenAI, and access to the selected model. Change `OPENAI_MODEL` to another model that supports image inputs, the Responses API, and Structured Outputs if needed.

Without Compose:

```powershell
docker build -t formdataextract .
docker run -d --name formdataextract --env-file .env -p 8086:8086 --restart unless-stopped formdataextract
```

Use either Compose or the standalone commands, not both simultaneously.

## How extraction works

- All field extraction uses OpenAI vision through the Responses API with a structured output schema. There is no Tesseract, local OCR, or label-parsing fallback.
- PDFs are rendered with PyMuPDF at up to 300 DPI, capped at 3,600 pixels per side. Images are oriented using EXIF metadata and transparent backgrounds are made white. Lossless PNG encoding preserves small character strokes without adding JPEG artifacts.
- Each page includes a full overview (up to 2,400 pixels per side). Pages larger than 1,600 pixels also include two or four overlapping close-ups from the higher-resolution image, helping the model read small text while retaining the full layout. All pages and views are sent together in one API request. The additional views increase API image usage and may take longer to process.
- The model is instructed to check all sections for missed fields, verify text and numbers against the close-ups, preserve leading zeros and exact visible characters, and report uncertainty instead of guessing. Repeated labels receive unique column names; overlapping views are explicitly identified as the same page to avoid duplicate fields. The filename column is supplied by the app.
- Extracted field columns follow the form order (top to bottom, left to right, or printed numbering), after the File name column. The first form establishes the shared column order; new fields in later forms are appended. CSV and Excel keep the same order as the review table.
- Address fields are stored and exported on one line: line breaks, tabs, and repeated whitespace become a single space. Address wording, punctuation, and postal codes are preserved. This also applies to pasted/edited addresses and direct CSV/Excel export requests. Other field values keep their original formatting.
- The UI processes files sequentially, shows progress, and retains failed files for retry. API authentication, quota, connection, refusal, and incomplete-result errors are displayed without exposing upstream error details.
- Review results against the original forms. AI extraction can miss fields or misread text; add missing columns and correct values before export.

## General form extraction

Student, teacher, employee and other forms use their own printed labels and field order.
Columns are detected from the document rather than a predefined template. Different people's
sections remain separate, blank fields stay blank, and values are never copied between sections.
Labels and values retain their original language and script. Each file becomes one row;
for consistent columns, upload forms with the same layout together.

## Data handling and limits

Form page images are sent to OpenAI, and API usage is billed to the configured account. Requests use `store=False`; this is not a promise of zero provider retention. Consult [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) for provider policies.

The app does not persist documents or extracted data. The workspace lasts only while the page remains open; refreshing clears it. Flask may temporarily spool uploads while handling a request. There is no authentication; use this deployment on a trusted local network.

- PDF, PNG, JPG/JPEG, TIFF, BMP, and WebP, including scanned PDFs.
- Up to 1,000 files per upload batch, each smaller than 50 MB. The browser uploads files individually, so there is no combined 50 MB limit on the selected batch. Keep the page open until processing finishes.
- Direct API requests accept up to 1,000 files with a 50 MB total request limit (including multipart overhead).
- 20 pages per file; 25 megapixels per source image.
- Encoded page images, including close-ups, are limited to 40 MB per document; split larger forms.
- Exports: up to 500 columns and 1,000 rows.
- Very small text, low-resolution scans, and complex layouts may need clearer uploads or manual corrections.

## Operations and development

```powershell
docker compose logs -f
docker compose down
```

For local Python development, install Python 3.11+, create a virtual environment, install `requirements.txt`, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the process environment, then run `python app.py`. Local Python execution does not automatically load `.env`; Compose does.

## Tests

The tests exercise the real OpenAI SDK using a mocked HTTP transport. They verify image/PDF inputs, lossless overlapping close-ups, orientation, multipage TIFFs, size limits, structured result parsing, single-line addresses, leading-zero preservation, API errors, and CSV/Excel exports without making paid API calls. These are regression tests, not a measurement of model reading accuracy. A live accuracy check requires your configured API key and representative forms with known correct values.

With Docker running, in PowerShell:

```powershell
Get-Content -Raw tests/test_app.py | docker compose exec -T formdataextract python -
```

Or with local dependencies installed: `python -m unittest discover -s tests -v`.

Official OpenAI documentation: [image inputs](https://developers.openai.com/api/docs/guides/images-vision), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
