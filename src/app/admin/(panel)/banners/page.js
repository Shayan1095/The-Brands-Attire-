import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { query } from "@/lib/db";
import { updateBannerAction, deleteBannerAction } from "@/lib/admin-actions";
import { BANNER_PLACEMENTS, bannerWarning } from "@/lib/format";
import { BannerUploader, ConfirmButton } from "@/components/admin/Widgets";

export const metadata = { title: "Banners" };

const DEVICE = { desktop: ["Desktop", "info"], mobile: ["Mobile", "ok"], both: ["Desktop + mobile", ""] };

export default async function Banners({ searchParams }) {
  const viewer = await requirePerm("banners");
  const sp = await searchParams;
  const placement = BANNER_PLACEMENTS[sp.placement] ? sp.placement : "home";
  const saved = Number(sp.saved) || 0;
  const [banners, counts] = await Promise.all([
    query("SELECT * FROM banners WHERE placement = $1 ORDER BY sort_order, id", [placement]),
    query("SELECT placement, count(*)::int AS n FROM banners GROUP BY placement"),
  ]);
  const isHome = placement === "home";
  const live = banners.filter((b) => b.is_active);
  const has = (d) => live.some((b) => b.device === d || b.device === "both");

  return (
    <>
      <div className="head">
        <div>
          <h1>Banners</h1>
          <p>The big photos at the top of each page. Upload any photo: wide ones are used on desktop, tall ones on phones, automatically.</p>
        </div>
        <div className="head__actions"><Link href={isHome ? "/" : "/"} target="_blank" className="btn btn--ghost">View shop ↗</Link></div>
      </div>

      <div className="tabs">
        {Object.entries(BANNER_PLACEMENTS).map(([key, label]) => (
          <Link key={key} href={`/admin/banners?placement=${key}`} className={placement === key ? "active" : ""}>
            {label} ({counts.find((c) => c.placement === key)?.n || 0})
          </Link>
        ))}
      </div>

      <div className="cols">
        <div>
          {live.length > 0 && (!has("desktop") || !has("mobile")) && (
            <div className="note note--warn">
              No {has("desktop") ? "tall (mobile)" : "wide (desktop)"} photo here yet, so {has("desktop") ? "phones" : "desktop screens"} will show a cropped
              {has("desktop") ? " desktop" : " mobile"} photo. Upload a {has("desktop") ? "tall" : "wide"} one for the best result.
            </div>
          )}
          {banners.length === 0 && (
            <div className="card"><p className="empty">No photos for this page yet. {isHome ? "The home page shows the single picture from Settings until you add slides." : "It shows a default picture until you upload one."}</p></div>
          )}
          {banners.map((b) => {
            const warning = bannerWarning(b);
            const [label, tone] = DEVICE[b.device];
            return (
              <div className="card" key={b.id}>
                <div className="banner-row">
                  <img src={b.image_url} alt="" className={`banner-thumb ${b.width < b.height ? "tall" : ""}`} />
                  <div style={{ minWidth: 0 }}>
                    <div className="inline" style={{ marginBottom: 10 }}>
                      <span className={`pill ${tone}`}>{label}</span>
                      <span className="dim">{b.width}×{b.height}px{b.device !== b.auto_device && ` · detected as ${b.auto_device}, changed by you`}</span>
                      {!b.is_active && <span className="pill bad">Hidden</span>}
                      {saved === b.id && <span className="pill ok">Saved</span>}
                    </div>
                    {warning && <div className="note note--warn">{warning}</div>}
                    <form action={updateBannerAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <div className="frow">
                        <div className="field">
                          <label>Show on</label>
                          <select name="device" defaultValue={b.device}>
                            <option value="desktop">Desktop only</option>
                            <option value="mobile">Mobile only</option>
                            <option value="both">Desktop + mobile</option>
                          </select>
                        </div>
                        <div className="field"><label>Position</label><input name="sort_order" type="number" defaultValue={b.sort_order} /></div>
                      </div>
                      {isHome ? (
                        <>
                          <div className="frow">
                            <div className="field"><label>Small line</label><input name="eyebrow" defaultValue={b.eyebrow} placeholder="New season · Live now" /></div>
                            <div className="field"><label>Headline</label><input name="title" defaultValue={b.title} placeholder="Wear *like* you mean it." /></div>
                          </div>
                          <div className="field"><label>Text</label><input name="subtitle" defaultValue={b.subtitle} /></div>
                          <div className="frow">
                            <div className="field"><label>Button text</label><input name="cta_text" defaultValue={b.cta_text} /></div>
                            <div className="field"><label>Button link</label><input name="cta_link" defaultValue={b.cta_link} placeholder="/products" /></div>
                          </div>
                          <small className="hint" style={{ marginBottom: 10 }}>Put *stars* around the word you want in red. Leave the text boxes empty to use the wording from Settings.</small>
                        </>
                      ) : (
                        <>{["eyebrow", "title", "subtitle", "cta_text", "cta_link"].map((n) => <input key={n} type="hidden" name={n} value={b[n]} />)}</>
                      )}
                      <label className="check"><input type="checkbox" name="is_active" defaultChecked={b.is_active} /> Show this photo</label>
                      <button className="btn btn--sm">Save</button>
                    </form>
                  </div>
                </div>
                <form action={deleteBannerAction} style={{ marginTop: 12, textAlign: "right" }}>
                  <input type="hidden" name="id" value={b.id} />
                  <ConfirmButton message="Delete this banner photo?">Delete</ConfirmButton>
                </form>
              </div>
            );
          })}
        </div>

        <div>
          <div className="card">
            <h2>Add photos to: {BANNER_PLACEMENTS[placement]}</h2>
            <p className="sub">
              {isHome
                ? "Each photo becomes a slide. The slideshow on desktop uses the wide photos, on phones the tall ones."
                : "Upload one wide photo for desktop and one tall photo for phones. The first of each kind is used."}
            </p>
            <BannerUploader placement={placement} />
          </div>
          <div className="card">
            <h2>How photos are sorted</h2>
            <ul className="timeline" style={{ marginTop: 8 }}>
              <li><span><b>Wide</b> (landscape)</span><span className="pill info">Desktop</span></li>
              <li><span><b>Tall</b> (portrait)</span><span className="pill ok">Mobile</span></li>
              <li><span><b>Square-ish</b></span><span className="pill">Both</span></li>
            </ul>
            <p className="sub" style={{ margin: "12px 0 0" }}>
              Best sizes: 2400×1350 or larger for desktop, 1080×1620 or larger for phones. Photos are shrunk and converted to WebP for speed. You can always override the choice with “Show on”.
              {isHome && <> The moving text strip is edited in <Link className="link" href="/admin/settings">Settings</Link>.</>}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
