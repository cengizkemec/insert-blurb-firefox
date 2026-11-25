# Privacy Policy / Gizlilik Politikası

**Last updated / Son güncelleme:** 2026-11-25

## English

Insert Blurb for Firefox does not collect, transmit, sell, or share any data.

- The extension makes **no network requests** and contains no analytics, telemetry, ads, or remote code.
- The text blurbs you create are stored only in Firefox's local extension storage on your device (the `blurbs` key). They are never uploaded or synced by this extension.
- Your blurbs are sent to a page only when you choose **Insert blurb** from the right-click menu. The content is delivered directly to the content script in that tab and is not sent anywhere else.
- The `<all_urls>` host permission is required to run the content script that inserts text into editable fields on the page you choose. The extension does not read, collect, or transmit page content.
- The `menus` permission builds the right-click submenu.
- The `notifications` permission is used only to show a local error notification when insertion fails.
- Exported JSON/TXT files are created locally by your browser and are only downloaded when you click the export button.

The add-on manifest declares `data_collection_permissions.required = ["none"]`.

Questions: open an issue at <https://github.com/cengizkemec/insert-blurb-firefox/issues>.

## Türkçe

Insert Blurb for Firefox hiçbir veriyi toplamaz, iletmez, satmaz veya paylaşmaz.

- Eklenti **hiçbir ağ isteği** göndermez; analitik, telemetri, reklam veya uzaktan kod içermez.
- Oluşturduğunuz metinler (blurb'lar) yalnızca cihazınızdaki Firefox yerel eklenti depolamasında (`blurbs` anahtarı) saklanır. Eklenti tarafından hiçbir yere yüklenmez veya eşitlenmez.
- Blurb'lar bir sayfaya yalnızca sağ tık menüsünden **Blurb ekle** seçeneğini seçtiğinizde gönderilir. Metin doğrudan o sekmedeki content script'e iletilir; başka bir yere gönderilmez.
- `<all_urls>` ana makine izni, seçtiğiniz sayfadaki düzenlenebilir alanlara metin ekleyen content script için gereklidir. Eklenti sayfa içeriğini okumaz, toplamaz veya iletmez.
- `menus` izni sağ tık alt menüsünü oluşturur.
- `notifications` izni yalnızca ekleme başarısız olduğunda yerel hata bildirimi göstermek için kullanılır.
- Dışa aktarılan JSON/TXT dosyaları tarayıcınız tarafından yerel olarak oluşturulur ve yalnızca dışa aktarma düğmesine tıkladığınızda indirilir.

Eklenti manifesti `data_collection_permissions.required = ["none"]` bildirir.

Sorularınız için: <https://github.com/cengizkemec/insert-blurb-firefox/issues>.
