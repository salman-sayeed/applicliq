# Scraper fixtures

Saved job pages used by `extract.test.ts`. They are trimmed to the parts the scrapers read (head
meta tags, JSON-LD, and the posting markup) and anonymized with fictional companies. The class
names and `data-*` attributes follow each site's real markup.

When a site changes its markup, save the live page (File > Save Page As > "Webpage, HTML only"),
strip anything personal, replace the fixture, and update the expectations in the test.
These files are excluded from Prettier so they stay as saved.
