# Autofill fixtures

Application forms used by `fixtures.test.ts`, saved in November 2026:

- `greenhouse-new.html`, `greenhouse-embed.html`, `lever.html`: the `<form>` of real public
  pages, as served (long option lists trimmed).
- `ashby.html`, `google-forms.html`, `microsoft-forms.html`: the rendered form of real public
  pages (these are built in the browser), with generated class names and inline styles stripped.
- `greenhouse-classic.html`: rebuilt from Greenhouse's classic markup; boards.greenhouse.io now
  redirects to the current boards, so no live classic page was available.

Excluded from Prettier so they stay as saved. When a site changes its markup, save the form again
and update the expectations.
