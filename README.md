# Silent Victory Training Center — UFC-style redesign
Pages: index.html, about.html, services.html, contact.html, shop.html  (styles in css/style.css)

Photos are loaded from your current site's image folder (https://www.silentvictorytc.com/img/),
so if you upload these files to the same host they keep working. To self-host, copy your img/
folder next to these pages and replace "https://www.silentvictorytc.com/img/" with "img/".

The contact form opens the visitor's email app addressed to SilentVictory.Shane@gmail.com.
To use a real form backend (Formspree, Netlify Forms, your old PHP handler), set the form's action.

## Changing photos (owner admin)
Every photo on the site is listed in `content/photos.json`, grouped by page. The owner edits them through
[Pages CMS](https://app.pagescms.org) (configured in `.pages.yml`): sign in, open **Website Photos**,
upload a new picture into any slot and save. Uploads go to `img/uploads/`, and `js/photos.js` swaps them
in on page load. The site's "Owner Login" link (footer) goes to `admin/`, which explains the steps.
