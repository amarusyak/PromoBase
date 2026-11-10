# PromoBase privacy policy

Last updated: 10 November 2026. Applies to PromoBase 0.1.0 for Google Chrome.

PromoBase keeps the promo codes you save and shows them again on the shop's site. Everything it does happens inside your Chrome profile. PromoBase has no server, no account and no analytics, and it makes no network requests.

## What PromoBase keeps, and where

Kept in your Chrome profile (`chrome.storage.local`) until you delete it or remove PromoBase:

- each code you save, with what you enter for it: the shop's address, start and expiry dates, and a note;
- whether PromoBase should open by itself on each shop's site.

Kept only while Chrome is open (`chrome.storage.session`), so that a reminder opens once per visit rather than on every page:

- for tabs on shops with reminders on: the tab's number, which shop it is on, and when PromoBase last opened there.

None of this is sent anywhere. Not to the developer, not to anyone else.

## What PromoBase looks at

- **The tab you open PromoBase on.** When you click the PromoBase button, it reads that tab's address to show the codes for that shop. Chrome allows this only for the tab and moment you click (the `activeTab` permission).
- **The toolbar icon.** On the sites of shops you have codes for, Chrome itself turns the icon yellow, from a list of those sites PromoBase gives it (the `declarativeContent` permission). PromoBase is not told which page you are on.
- **Shops you turn reminders on for.** Only if you choose it, and only after Chrome asks you, PromoBase gets access to the site of each shop you turn reminders on for, and to nothing else. Chrome may ask about several shops at once, for example after an import. It uses that access for one thing: to learn the address of a tab on that site, so it can open by itself and list your codes. It does not read the content of any page, and it never fills in, clicks or changes anything on a page. When no code of a shop has reminders on any more, PromoBase gives that access back.

PromoBase never sees other sites you visit, your browsing history, passwords, forms, carts or payment details.

## Incognito

Chrome keeps PromoBase off in Incognito windows unless you allow it in PromoBase's settings in `chrome://extensions`. If you do, the same PromoBase works in Incognito and normal windows, with one set of saved codes:

- A code you save in an Incognito window is kept in your profile like any other, and stays after the window closes. Delete it in the library if you do not want to keep it.
- What PromoBase notes about an Incognito tab (which shop it is on) is forgotten when the tab closes; when a reminder was last shown for a shop is kept until Chrome closes.
- Site access you give a shop applies in Incognito windows too.

## Files

**Export** saves your codes to a file on your computer, and **Import** reads a file you choose. Both happen only when you click them, and the file goes nowhere else.

## Who receives your data

Nobody. PromoBase does not sell, share, or transfer your data, does not use it for advertising or for anything other than showing you your own codes, and does not use it to judge creditworthiness or for lending.

## Deleting your data

- Delete a code in the PromoBase library to remove it.
- Removing PromoBase from Chrome deletes everything it kept. Export first if you want a copy.
- Clearing Chrome's browsing history does not remove your codes.
- Chrome keeps its own list of sites you once allowed an extension to access, even after PromoBase gives the access back. You can clear it from PromoBase's **Site access** settings in `chrome://extensions`.

## Changes

If a later version handles data differently, for example with an optional account, this policy will say so before that version is published, with a new date at the top.

## Contact

Questions about this policy: open an issue at <https://github.com/amarusyak/PromoBase/issues>.
