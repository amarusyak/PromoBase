# Chrome Web Store listing

Text to paste into the Chrome Web Store developer dashboard for PromoBase 0.1.0. Keep it in step with `PRIVACY.md` and `public/manifest.json`: a change to either should be checked here too.

## Store listing

**Name:** PromoBase

**Summary** (from the manifest, 132 characters at most):

> Save promo codes and get reminded of them on the merchant's site.

**Category:** Lifestyle > Shopping

**Language:** English

**Description:**

> Found a promo code in a video, a newsletter or a post, but not ready to buy yet? Save it in PromoBase, and find it again when you get to the shop.
>
> - Save a code with the shop it is for, a start or expiry date, and a short note.
> - On that shop's site, the PromoBase icon turns yellow. Click it to see your codes for that shop and copy one.
> - If you like, PromoBase can open by itself when you visit a shop you choose. Chrome asks you first, one shop at a time.
> - Codes past their expiry date stay in your list, marked Expired, so nothing disappears without you knowing.
> - Search, edit and delete your codes in the library. Export them to a file, and import that file on another computer.
>
> PromoBase does not check whether a code works; the shop decides that at checkout. It does not search for codes or apply them for you.
>
> Private by design: your codes stay in your Chrome profile. There is no account, no server and no analytics, and PromoBase makes no network requests. It reads nothing on the pages you visit.
>
> Your codes are lost if you remove PromoBase or lose your Chrome profile, so keep a copy with Export.
>
> Up to 100 codes. Needs Chrome 127 or later.

**Graphic assets:**

| Asset                       | File                                                            |
| --------------------------- | --------------------------------------------------------------- |
| Store icon, 128 x 128       | `public/icons/icon-128.png`                                     |
| Small promo tile, 440 x 280 | `store/promo-tile-440x280.png`                                  |
| Screenshots, 1280 x 800     | `store/screenshot-*.png`, made by the browser checks in CI (E3) |

**Homepage URL:** https://github.com/amarusyak/PromoBase

**Support URL:** https://github.com/amarusyak/PromoBase/issues

## Privacy practices

**Single purpose:**

> PromoBase saves the promo codes a person enters and shows them again when that person is on the shop's website.

**Permission justifications:**

| Permission                             | Justification                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                              | Keeps the codes the person saves, and whether reminders are on for each shop, in the Chrome profile. Also keeps, while Chrome is open, which tabs a reminder has already been shown on, so it opens once per visit.                                                                                                                                                                          |
| `activeTab`                            | When the person clicks the PromoBase button, reads that tab's address to list the codes saved for that shop.                                                                                                                                                                                                                                                                                 |
| `declarativeContent`                   | Lets Chrome change the toolbar icon on the sites of shops the person has codes for, without PromoBase getting access to those sites or learning which page is open.                                                                                                                                                                                                                          |
| Host permissions (`*://*/*`, optional) | Never granted at install. Asked for one shop at a time, as `*://*.<shop domain>/*`, only when the person turns on reminders for that shop and after PromoBase explains why. Used only to learn that a tab is on that shop's site, so PromoBase can open by itself and list its codes. No page content is read and no script is run on any page. Access a shop no longer needs is given back. |

**Remote code:** No, I am not using remote code. Every script is in the package; the extension loads nothing from the network.

**Data usage:**

Leave every data type unchecked. PromoBase keeps what the person enters, and the addresses it reads, in the browser only; nothing is sent to the developer or anyone else. Chrome's extensions DevRel has said storing user data locally only does not require a disclosure, while data that leaves the device does ([chromium-extensions thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/E6YoDbui4_Y), January 2021). If a review asks otherwise, the closest types are "Website content" (the codes and notes) and "Web history" (the tab address read on a click or on a shop with reminders on).

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/amarusyak/PromoBase/blob/main/PRIVACY.md (the repository has to be public, or the file hosted elsewhere, before submission).

## Distribution

Public, all regions, free. No in-app purchases.
