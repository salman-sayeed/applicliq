# Old site redirect

`_redirects` is deployed on its own to the old `career-pocket` Cloudflare Pages project
(https://career-pocket.pages.dev), so every old URL answers with a 301 to the same path on
https://applicliq.pages.dev. It is not part of any build. Redeploy it with:

```bash
npx wrangler pages deploy redirect-site --project-name=career-pocket --branch=main
```

Never delete the old project: links to it in old installs, bookmarks and search results depend
on the redirect.
