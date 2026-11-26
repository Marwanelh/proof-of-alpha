"""Generate the 11 scenes and the root composition, timed to the real ElevenLabs audio.

Why a generator instead of hand-written files: the alignment complaint was that each scene sat at
a different x/width. Here every panel and every text column comes from the same layout function, so
they cannot drift, and a re-time after new audio is one number per scene, not eleven edits.

Contract rules obeyed (hyperframes references/format.md):
  - scene file = <template> with <style> + markup + <script>; root styled as #root, inset:0
  - one paused timeline per composition, registered on window.__timelines[<composition-id>]
  - host id == composition id, or each render waits 45 s
  - fromTo only, never from (hosts re-seek scenes)
  - no Date.now / Math.random / network / timers
"""

import json
import math
import pathlib

FILM = pathlib.Path("film")
COMP = FILM / "compositions"
COMP.mkdir(parents=True, exist_ok=True)

VO = pathlib.Path("vocals")
TAIL = 0.40  # seconds of scene after its narration ends, so cuts breathe

# ---------------------------------------------------------------- the film, in words and numbers
# dur is filled from the mp3; everything else is content.
SCENES = [
    dict(id="s01", vo="s01.mp3", variant="type",
         kicker="proof of alpha",
         hero=["Every influencer", "has a following."],
         hero2="Almost none has a record.",
         foot="BNB Bangkok 2026"),
    dict(id="s02", vo="s02.mp3", variant="panel", panel="panel-check.png", kicker="01 · the claim",
         head="Four things, read from the post.",
         chips=[("ASSET", "BNB"), ("SIDE", "bearish"), ("TARGET", "$500"), ("BY", "1 Dec 2026")]),
    dict(id="s03", vo="s03.mp3", variant="bignum", panel="panel-check.png",
         kicker="02 · the price at posting", big="$553.92",
         label="CoinMarketCap · keyed", sub="the price when the call was posted"),
    dict(id="s04", vo="s04.mp3", variant="bignum", panel="panel-check.png",
         kicker="03 · the on-chain price", big="$553.56",
         label="Atlas · single feed “bnb/usd”", sub="BSC mainnet · block 135,924,867"),
    dict(id="s05", vo="s05.mp3", variant="bignum", panel="panel-check.png",
         kicker="04 · the baseline", big="64%",
         label="the market's own odds", sub="a volatility model, labelled on the number itself"),
    dict(id="s06", vo="s06.mp3", variant="formula", kicker="05 · the metric",
         formula=["edge", "=", "outcome", "−", "probability"],
         cases=[("p = 0.9 · right", "+0.1"), ("p = 0.2 · right", "+0.8"), ("p = 0.7 · wrong", "−0.7")],
         foot="illustrative inputs"),
    dict(id="s07", vo="s07.mp3", variant="panel", panel="panel-board.png", kicker="06 · the record",
         head="Real calls. Real prices.",
         stats=[("8", "calls scored"), ("3", "KOLs tracked"), ("1", "on-chain receipt")],
         note="every row that used a proxy says so"),
    dict(id="s08", vo="s08.mp3", variant="panel", panel="panel-call.png", kicker="07 · the reviewed call",
         head="Priced by Cournot. Locked on BNB Chain.",
         stats=[("29%", "Cournot at post"), ("0x2527…4a80", "receipt"), ("—", "edge: open until 1 Dec")],
         note="DemoBear · BNB below $500 by 1 Dec"),
    dict(id="s09", vo="s09.mp3", variant="stack", kicker="08 · on chain",
         head="One transaction, and a flag.",
         rows=[("cournotBps", "2902"), ("atlasVerified", "false"), ("block", "145,045,939")],
         note="the Atlas price was referenced, not verified inside the transaction"),
    dict(id="s10", vo="s10.mp3", variant="type", kicker="09 · who it is for",
         hero=["A launchpad vets", "a promoter"],
         hero2="before it pays for the campaign.",
         foot="real probability vs proxy — visible on every row"),
    dict(id="s11", vo="s11.mp3", variant="close", kicker="proof of alpha",
         head="What is missing is one real probability.",
         rows=[("works today", "a call · two prices · a deadline · a receipt"),
               ("still missing", "the outcome on 1 December")],
         links=["proof-of-alpha-three.vercel.app", "github.com/Marwanelh/proof-of-alpha"]),
]

# ---------------------------------------------------------------- measure the audio
def dur(path: pathlib.Path) -> float:
    import subprocess
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path.as_posix()], capture_output=True, text=True)
    return float(out.stdout.strip())


for s in SCENES:
    s["dur"] = dur(VO / s["vo"])
    s["scene"] = round(s["dur"] + TAIL, 2)
    s["vo_dur"] = round(s["dur"], 3)

t = 0.0
for s in SCENES:
    s["start"] = round(t, 2)
    t += s["scene"]
TOTAL = round(t, 2)

# ---------------------------------------------------------------- shared look
BASE = """
    #root {{ position: absolute; inset: 0; background: #07080a; color: #f4f3ee;
            font-family: "Inter", sans-serif; overflow: hidden; }}
    .kicker {{ position: absolute; left: {x}; top: 108px;
              font-family: "IBM Plex Mono", monospace; font-size: 20px;
              letter-spacing: 0.2em; color: #c9f24d; text-transform: uppercase; }}
    .rule {{ position: absolute; left: {x}; top: 150px; width: {w}px; height: 1px;
             background: #23262c; transform-origin: left center; }}
    .panel {{ position: absolute; left: 72px; top: 190px; width: 1080px; height: 720px;
              border: 1px solid #23262c; border-radius: 16px; overflow: hidden;
              background: #0b0d10; }}
    .panel img {{ display: block; width: 100%; height: 100%; object-fit: cover; }}
    .dim {{ position: absolute; inset: 0; background: rgba(7,8,10,0.82); }}
    .col {{ position: absolute; left: 1200px; top: 196px; width: 650px; }}
    .mono {{ font-family: "IBM Plex Mono", monospace; }}
    .foot {{ position: absolute; left: {x}; bottom: 74px; font-size: 28px;
             color: #8b9099; font-family: "IBM Plex Mono", monospace; }}
"""


def wrap(cid, scene_len, css, markup, script):
    # One slow drift per scene so no stretch of the picture is ever static. The linter's
    # dead_stretch rule exists because a frozen frame reads as a stall; narration does not help if
    # the image stops moving while it plays.
    drift = f'    tl.fromTo("#{cid}-all", {{y:0}}, {{y:-12, duration:{scene_len}, ease:"none"}}, 0);'
    return f"""<template>
  <style>
{css}
  </style>
  <div id="root" data-composition-id="{cid}" data-width="1920" data-height="1080">
    <div id="{cid}-all" class="clip" data-start="0" data-duration="{scene_len}">
{markup}
    </div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{script}
{drift}
    window.__timelines = window.__timelines || {{}};
    window.__timelines["{cid}"] = tl;
  </script>
</template>"""


def build(s):
    cid, n = s["id"], s["scene"]
    k = s["kicker"]
    base = BASE.format(x="72px", w="720")
    pad = lambda a, b: f"  {a}\n{b}"

    if s["variant"] == "type":
        css = base + """
    .hero { position: absolute; left: 72px; top: 230px; font-size: 96px; font-weight: 900;
            letter-spacing: -0.035em; line-height: 1.02; }
    .hero2 { position: absolute; left: 72px; top: 460px; font-size: 54px; font-weight: 400;
             color: #8b9099; letter-spacing: -0.02em; }
    .glow { position: absolute; left: 72px; top: 150px; width: 640px; height: 3px;
            background: #c9f24d; }
"""
        hero = "<br />".join(s["hero"])
        markup = f"""      <div id="{cid}-k" class="kicker">{k}</div>
      <div id="{cid}-g" class="glow"></div>
      <div id="{cid}-h" class="hero">{hero}</div>
      <div id="{cid}-h2" class="hero2">{s["hero2"]}</div>
      <div id="{cid}-f" class="foot">{s["foot"]}</div>"""
        script = f"""    tl.fromTo("#{cid}-k", {{opacity:1,y:0}}, {{opacity:1,y:0,duration:0.01}}, 0);
    tl.fromTo("#{cid}-g", {{scaleX:0}}, {{scaleX:1,duration:0.6,ease:"power2.out"}}, 0.5);
    tl.fromTo("#{cid}-h", {{opacity:0,y:24}}, {{opacity:1,y:0,duration:0.8,ease:"power2.out"}}, 0.7);
    tl.fromTo("#{cid}-h2", {{opacity:0,y:18}}, {{opacity:1,y:0,duration:0.7,ease:"power2.out"}}, 1.5);
    tl.fromTo("#{cid}-f", {{opacity:0}}, {{opacity:1,duration:0.6}}, {max(3.0, n*0.55):.2f});"""

    elif s["variant"] == "bignum":
        css = base + """
    .big { position: absolute; left: 1200px; top: 300px; font-family: "IBM Plex Mono", monospace;
           font-size: 150px; letter-spacing: -0.03em; line-height: 1; }
    .label { position: absolute; left: 1200px; top: 490px; font-size: 34px; font-weight: 700; }
    .sub { position: absolute; left: 1200px; top: 540px; width: 620px; font-size: 26px;
           color: #8b9099; font-family: "IBM Plex Mono", monospace; line-height: 1.45; }
    .pill { position: absolute; left: 1200px; top: 620px; padding: 10px 18px;
            border: 1px solid #c9f24d; border-radius: 999px; color: #c9f24d;
            font-family: "IBM Plex Mono", monospace; font-size: 22px; }
"""
        pill = (f'      <div id="{cid}-p" class="pill">proxy · not Cournot</div>'
                if s["id"] == "s05" else "")
        markup = f"""      <div class="panel" id="{cid}-pn"><img id="{cid}-img" src="assets/{s["panel"]}" alt="" />
        <div class="dim"></div></div>
      <div id="{cid}-k" class="kicker">{k}</div>
      <div id="{cid}-r" class="rule"></div>
      <div id="{cid}-b" class="big">{s["big"]}</div>
      <div id="{cid}-l" class="{"label" if pill else "label"}">{s["label"]}</div>
      <div id="{cid}-s" class="sub">{s["sub"]}</div>
{pill}"""
        script = f"""    tl.fromTo("#{cid}-k", {{opacity:0,y:12}}, {{opacity:1,y:0,duration:0.45}}, 0.15);
    tl.fromTo("#{cid}-r", {{scaleX:0}}, {{scaleX:1,duration:0.5,ease:"power2.out"}}, 0.4);
    tl.fromTo("#{cid}-img", {{opacity:0}}, {{opacity:0.35,duration:1.2}}, 0);
    tl.fromTo("#{cid}-pn", {{scale:1}}, {{scale:1.02,duration:{n},ease:"none"}}, 0);
    tl.fromTo("#{cid}-b", {{opacity:0,y:26,scale:0.96}}, {{opacity:1,y:0,scale:1,duration:0.75,ease:"power3.out"}}, 0.5);
    tl.fromTo("#{cid}-l", {{opacity:0,y:14}}, {{opacity:1,y:0,duration:0.5}}, 1.15);
    tl.fromTo("#{cid}-s", {{opacity:0}}, {{opacity:1,duration:0.5}}, {max(1.6, n*0.34):.2f});
{('    tl.fromTo("#'+cid+'-p", {opacity:0,scale:0.9}, {opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"}, '+format(max(2.0,n*0.42),".2f")+');') if pill else ''}"""

    elif s["variant"] == "panel":
        css = base + """
    h1 { font-size: 46px; font-weight: 900; letter-spacing: -0.03em; line-height: 1.06;
         margin: 8px 0 26px; }
    .chip { display: inline-block; margin: 0 12px 12px 0; padding: 12px 18px;
            border: 1px solid #23262c; border-radius: 12px; }
    .chip .l { font-family: "IBM Plex Mono", monospace; font-size: 17px; letter-spacing: 0.14em;
               color: #8b9099; text-transform: uppercase; }
    .chip .v { font-family: "IBM Plex Mono", monospace; font-size: 30px; margin-top: 2px; }
    .stat { border-top: 1px solid #23262c; padding: 11px 0; }
    .stat .n { font-family: "IBM Plex Mono", monospace; font-size: 38px; }
    .stat .l { font-family: "IBM Plex Mono", monospace; font-size: 19px; color: #8b9099;
               letter-spacing: 0.1em; text-transform: uppercase; margin-top: 2px; }
    .note { font-family: "IBM Plex Mono", monospace; font-size: 22px; color: #8b9099;
            margin-top: 16px; line-height: 1.45; }
"""
        if "chips" in s:
            body = "\n".join(
                f'        <div id="{cid}-c{i}" class="chip"><div class="l">{l}</div>'
                f'<div class="v">{v}</div></div>'
                for i, (l, v) in enumerate(s["chips"], 1))
            inner = f'      <div id="{cid}-head" class="h1col"><h1>{s["head"]}</h1></div>\n{body}'
            stagger = "\n".join(
                f'    tl.fromTo("#{cid}-c{i}", {{opacity:0,y:16}}, {{opacity:1,y:0,duration:0.45,ease:"power2.out"}}, {0.8 + i * 0.5:.2f});'
                for i in range(1, len(s["chips"]) + 1))
        else:
            body = "\n".join(
                f'        <div id="{cid}-s{i}" class="stat"><div class="n">{n_}</div>'
                f'<div class="l">{l}</div></div>'
                for i, (n_, l) in enumerate(s["stats"], 1))
            inner = f'      <div id="{cid}-head" class="h1col"><h1>{s["head"]}</h1></div>\n{body}'
            stagger = "\n".join(
                f'    tl.fromTo("#{cid}-s{i}", {{opacity:0,x:18}}, {{opacity:1,x:0,duration:0.45,ease:"power2.out"}}, {0.7 + i * 0.6:.2f});'
                for i in range(1, len(s["stats"]) + 1))
        markup = f"""      <div class="panel"><img id="{cid}-img" src="assets/{s["panel"]}" alt="" /></div>
      <div id="{cid}-k" class="kicker">{k}</div>
      <div id="{cid}-r" class="rule"></div>
      <div class="col">
{inner}
        <div id="{cid}-note" class="note">{s.get("note","")}</div>
      </div>"""
        script = f"""    tl.fromTo("#{cid}-k", {{opacity:0,y:12}}, {{opacity:1,y:0,duration:0.45}}, 0.15);
    tl.fromTo("#{cid}-r", {{scaleX:0}}, {{scaleX:1,duration:0.5,ease:"power2.out"}}, 0.4);
    tl.fromTo("#{cid}-img", {{opacity:0,scale:1.03}}, {{opacity:1,scale:1,duration:1.2,ease:"power2.out"}}, 0);
    tl.fromTo("#{cid}-head", {{opacity:0,y:16}}, {{opacity:1,y:0,duration:0.6,ease:"power2.out"}}, 0.5);
{stagger}
    tl.fromTo("#{cid}-note", {{opacity:0}}, {{opacity:1,duration:0.5}}, {max(2.4, n*0.62):.2f});
    tl.fromTo("#{cid}-img", {{scale:1}}, {{scale:1.035,duration:{n},ease:"none"}}, 0);"""

    elif s["variant"] == "formula":
        css = base + """
    .f { position: absolute; left: 72px; top: 240px; font-family: "IBM Plex Mono", monospace;
         font-size: 86px; letter-spacing: -0.02em; }
    .f span { display: inline-block; margin-right: 22px; }
    .op { color: #c9f24d; }
    .case { position: absolute; left: 72px; width: 1770px; display: flex; gap: 34px;
            align-items: baseline; border-top: 1px solid #23262c; padding: 20px 0;
            font-family: "IBM Plex Mono", monospace; }
    .case .a { font-size: 26px; color: #8b9099; width: 400px; }
    .case .b { font-size: 46px; }
    .pos { color: #c9f24d; } .neg { color: #ff7a6b; }
"""
        terms = "".join(f'<span id="{cid}-t{i}" class="{"op" if t in "=−" else ""}">{t}</span>'
                        for i, t in enumerate(s["formula"]))
        cases = "".join(
            f'        <div id="{cid}-c{i}" class="case"><div class="a">{a}</div>'
            f'<div class="b {"pos" if v.startswith("+") else "neg"}">{v}</div></div>'
            for i, (a, v) in enumerate(s["cases"], 1))
        # stack the cases down the page
        case_css = "".join(f'\n    #{cid}-c{i} {{ top: {430 + (i-1)*104}px; }}' for i in range(1, len(s["cases"]) + 1))
        markup = f"""      <div id="{cid}-k" class="kicker">{k}</div>
      <div id="{cid}-r" class="rule"></div>
      <div id="{cid}-f" class="f">{terms}</div>
{cases}
      <div id="{cid}-ft" class="foot">{s["foot"]}</div>"""
        script = f"""    tl.fromTo("#{cid}-k", {{opacity:0,y:12}}, {{opacity:1,y:0,duration:0.45}}, 0.15);
    tl.fromTo("#{cid}-r", {{scaleX:0}}, {{scaleX:1,duration:0.5,ease:"power2.out"}}, 0.4);
""" + "\n".join(
            f'    tl.fromTo("#{cid}-t{i}", {{opacity:0,y:14}}, {{opacity:1,y:0,duration:0.4,ease:"power2.out"}}, {0.5 + i * 0.22:.2f});'
            for i in range(len(s["formula"]))) + "\n" + "\n".join(
            f'    tl.fromTo("#{cid}-c{i}", {{opacity:0,x:16}}, {{opacity:1,x:0,duration:0.45,ease:"power2.out"}}, {2.6 + (i-1) * 0.6:.2f});'
            for i in range(1, len(s["cases"]) + 1)) + f"""
    tl.fromTo("#{cid}-ft", {{opacity:0}}, {{opacity:1,duration:0.5}}, {max(4.4, n*0.62):.2f});"""
        css = css + case_css

    elif s["variant"] == "stack":
        css = base + """
    h1 { font-size: 48px; font-weight: 900; letter-spacing: -0.03em; line-height: 1.06; margin-bottom: 26px; }
    .ln { display: flex; justify-content: space-between; align-items: baseline;
          border-top: 1px solid #23262c; padding: 14px 0; }
    .ln .k { font-family: "IBM Plex Mono", monospace; font-size: 22px; color: #8b9099;
             letter-spacing: 0.1em; text-transform: uppercase; }
    .ln .v { font-family: "IBM Plex Mono", monospace; font-size: 40px; }
    .flag { color: #ff7a6b; }
    .note { font-family: "IBM Plex Mono", monospace; font-size: 22px; color: #8b9099;
            margin-top: 20px; line-height: 1.5; }
    .card { position: absolute; left: 72px; top: 240px; width: 1000px; padding: 36px;
            border: 1px solid #23262c; border-radius: 16px; background: #0b0d10; }
    .card .t { font-family: "IBM Plex Mono", monospace; font-size: 20px; color: #8b9099;
               letter-spacing: 0.14em; text-transform: uppercase; }
    .card .h { font-family: "IBM Plex Mono", monospace; font-size: 42px; margin-top: 12px; }
    .card .addr { font-family: "IBM Plex Mono", monospace; font-size: 24px; color: #8b9099;
                  margin-top: 18px; }
"""
        rows = "".join(
            f'        <div id="{cid}-l{i}" class="ln"><div class="k">{a}</div>'
            f'<div class="v {"flag" if v == "false" else ""}">{v}</div></div>'
            for i, (a, v) in enumerate(s["rows"], 1))
        markup = f"""      <div id="{cid}-k" class="kicker">{k}</div>
      <div id="{cid}-r" class="rule"></div>
      <div id="{cid}-card" class="card"><div class="t">recordCall · BSC testnet</div><div class="h">0x25270499…4a80</div><div class="addr">CallRegistry 0x6860…0360</div></div>
      <div class="col" style="top: 200px">
        <h1>{s["head"]}</h1>
{rows}
        <div id="{cid}-note" class="note">{s["note"]}</div>
      </div>"""
        script = f"""    tl.fromTo("#{cid}-k", {{opacity:0,y:12}}, {{opacity:1,y:0,duration:0.45}}, 0.15);
    tl.fromTo("#{cid}-r", {{scaleX:0}}, {{scaleX:1,duration:0.5,ease:"power2.out"}}, 0.4);
    tl.fromTo("#{cid}-card", {{opacity:0,x:-18}}, {{opacity:1,x:0,duration:0.6,ease:"power2.out"}}, 0.5);
""" + "\n".join(
            f'    tl.fromTo("#{cid}-l{i}", {{opacity:0,x:18}}, {{opacity:1,x:0,duration:0.45,ease:"power2.out"}}, {0.7 + (i-1) * 0.7:.2f});'
            for i in range(1, len(s["rows"]) + 1)) + f"""
    tl.fromTo("#{cid}-note", {{opacity:0}}, {{opacity:1,duration:0.5}}, {max(3.0, n*0.7):.2f});"""

    else:  # close
        css = base + """
    h1 { font-size: 52px; font-weight: 900; letter-spacing: -0.03em; line-height: 1.05; margin-bottom: 28px; }
    .row { border-top: 1px solid #23262c; padding: 14px 0; }
    .row .k { font-family: "IBM Plex Mono", monospace; font-size: 19px; color: #8b9099;
              letter-spacing: 0.14em; text-transform: uppercase; }
    .row .v { font-size: 30px; margin-top: 4px; }
    .links { position: static; margin-top: 40px; font-family: "IBM Plex Mono", monospace;
             font-size: 30px; line-height: 1.6; }
    .links .dim2 { color: #8b9099; }
"""
        rows = "".join(
            f'        <div id="{cid}-r{i}" class="row"><div class="k">{a}</div>'
            f'<div class="v">{b}</div></div>'
            for i, (a, b) in enumerate(s["rows"], 1))
        markup = f"""      <div id="{cid}-k" class="kicker">{k}</div>
      <div id="{cid}-rl" class="rule"></div>
      <div class="col" style="left: 72px; top: 200px; width: 1680px">
        <h1 id="{cid}-h">{s["head"]}</h1>
{rows}
        <div id="{cid}-lk" class="links">{s["links"][1]}<br />{s["links"][0]}</div>
      </div>"""
        script = f"""    tl.fromTo("#{cid}-k", {{opacity:0,y:12}}, {{opacity:1,y:0,duration:0.45}}, 0.15);
    tl.fromTo("#{cid}-rl", {{scaleX:0}}, {{scaleX:1,duration:0.5,ease:"power2.out"}}, 0.4);
    tl.fromTo("#{cid}-h", {{opacity:0,y:16}}, {{opacity:1,y:0,duration:0.6,ease:"power2.out"}}, 0.6);
""" + "\n".join(
            f'    tl.fromTo("#{cid}-r{i}", {{opacity:0,y:14}}, {{opacity:1,y:0,duration:0.45}}, {1.5 + (i-1) * 0.8:.2f});'
            for i in range(1, len(s["rows"]) + 1)) + f"""
    tl.fromTo("#{cid}-lk", {{opacity:0,y:12}}, {{opacity:1,y:0,duration:0.6}}, {max(4.0, n*0.7):.2f});"""

    return wrap(cid, n, css, markup, script)


for s in SCENES:
    (COMP / f'{s["id"]}.html').write_text(build(s), encoding="utf-8")
    print(f'  {s["id"]}  audio {s["dur"]:5.2f}s  scene {s["scene"]:5.2f}s  starts {s["start"]:6.2f}s')

# ---------------------------------------------------------------- root composition
hosts, audios = [], []
for s in SCENES:
    hosts.append(f"""      <div id="{s['id']}" class="clip host" data-composition-id="{s['id']}"
           data-composition-src="compositions/{s['id']}.html"
           data-start="{s['start']}" data-duration="{s['scene']}" data-track-index="0"
           data-width="1920" data-height="1080"></div>""")
    audios.append(f"""      <audio id="vo-{s['id']}" data-start="{s['start']}"
             data-duration="{s['vo_dur']}" data-track-index="1"
             src="assets/vocals/{s['vo']}"></audio>""")

root = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      :root {{ --ground: #07080a; --ink: #f4f3ee; --accent: #c9f24d; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden;
                    background: var(--ground); color: var(--ink);
                    font-family: "Inter", sans-serif; }}
      #root {{ width: 100%; height: 100%; position: relative; }}
      .host {{ position: absolute; inset: 0; }}
    </style>
  </head>
  <body>
    <!--
      Proof of Alpha - {TOTAL:.0f} s. Eleven scenes, one per narration file; scene lengths are the
      measured mp3 durations + 0.40 s of tail, so the picture is cut to the audio rather than the
      audio squeezed into a fixed length. Every number on screen is from a live capture; the ledger
      is docs/video/script.md. No fixture probability appears anywhere.
    -->
    <div id="root" data-composition-id="main" data-start="0"
         data-duration="{TOTAL}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}

{chr(10).join(audios)}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
(FILM / "index.html").write_text(root, encoding="utf-8")
print(f"\n  TOTAL {TOTAL:.2f}s  ({TOTAL/60:.2f} min)  -> film/index.html + 11 scenes")