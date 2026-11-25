
'use strict';

const $ = id => document.getElementById(id);

// Opret inputfelter

function field(parent, id, label, value, type = 'number') {
    const l = document.createElement('label');
    l.textContent = label;

    const i = document.createElement('input');

    i.id = id;
    i.type = type;
    i.value = value;

    if (type === 'number')
        i.step = 'any';

    l.append(i);
    $(parent).append(l);
}

// Datoer

const today = new Date();

const expiry = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 56
);

const iso = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Markedsdata

field('market', 'spot', 'Aktuel kurs', 54.25);
field('market', 'strike', 'Strike', 54);
field('market', 'expiry', 'Udløbsdato', '2027-01-15', 'date');
field('market', 'rate', 'Rente (%)', 5.3);
field('market', 'div', 'Udbytte (%)', 0);

// Optionspriser

for (const [id, label, v] of [
    ['cb', 'Call bid', 2.54],
    ['ca', 'Call ask', 2.76],
    ['pb', 'Put bid', 2.1],
    ['pa', 'Put ask', 2.22]
]) {
    field('quotes', id, label, v);
}

// Afkastberegning

for (const [id, label, v] of [
    ['target', 'Afkastkrav (%)', 10],
    ['bid', 'Bid', 3.05],
    ['ask', 'Ask', 4.1],
    ['income', 'Premium (afkast)', 0.55]
]) {
    field('returns', id, label, v);
}

// Hjælpefunktioner

const num = id =>
    $(id).value.trim() === ''
        ? NaN
        : Number($(id).value);

const fmt = (n, d = 2) =>
    Number.isFinite(n)
        ? n.toLocaleString('da-DK', {
            minimumFractionDigits: d,
            maximumFractionDigits: d
        })
        : '—';

// Kumulativ standardnormalfordeling

function N(x) {
    const a = Math.abs(x);
    const t = 1 / (1 + 0.2316419 * a);

    const p =
        1 -
        Math.exp(-a * a / 2) /
        Math.sqrt(2 * Math.PI) *
        t * (
            0.31938153 +
            t * (
                -0.356563782 +
                t * (
                    1.781477937 +
                    t * (
                        -1.821255978 +
                        t * 1.330274429
                    )
                )
            )
        );

    return x >= 0 ? p : 1 - p;
}

// Black-Scholes
//
// s = Aktuel kurs
// k = Strike
// t = Tid til udløb i år
// r = Risikofri rente
// q = Udbytteprocent
// v = Volatilitet

function bs(s, k, t, r, q, v) {

    const d1 =
        (Math.log(s / k) +
            (r - q + v * v / 2) * t) /
        (v * Math.sqrt(t));

    const d2 = d1 - v * Math.sqrt(t);

    const u = Math.exp(-q * t);
    const b = Math.exp(-r * t);

    return {
        d1,
        d2,
        u,
        C: s * u * N(d1) - k * b * N(d2),
        P: k * b * N(-d2) - s * u * N(-d1)
    };
}

// Beregn implicit volatilitet med binær søgning

function implied(s, k, t, r, q, p, type) {

    const a = s * Math.exp(-q * t);
    const b = k * Math.exp(-r * t);

    const lo = type === 'C'
        ? Math.max(0, a - b)
        : Math.max(0, b - a);

    const hi = type === 'C' ? a : b;

    if (!(p > lo && p < hi))
        return NaN;

    let l = 1e-9;
    let h = 1;

    while (bs(s, k, t, r, q, h)[type] < p && h < 128) {
        h *= 2;
    }

    for (let i = 0; i < 100; i++) {

        const m = (l + h) / 2;

        if (bs(s, k, t, r, q, m)[type] < p)
            l = m;
        else
            h = m;
    }

    return (l + h) / 2;
}

// Vis beregningsresultater

function metrics(id, rows) {

    $(id).replaceChildren(
        ...rows.map(([label, value]) => {

            const d = document.createElement('div');
            d.className = 'metric';

            const a = document.createElement('span');
            a.textContent = label;

            const b = document.createElement('strong');
            b.textContent = value;

            d.append(a, b);

            return d;
        })
    );
}

// Opdater alle beregninger

function update() {

    const s = num('spot');
    const k = num('strike');

    const r = num('rate') / 100;
    const q = num('div') / 100;

    const days = (
        Date.parse($('expiry').value) -
        Date.parse(iso(new Date()))
    ) / 86400000;

    const t = days / 365;

    const type = $('type').value;

    // Optionspriser

    const cb = num('cb');
    const ca = num('ca');

    const pb = num('pb');
    const pa = num('pa');

    const cm = (cb + ca) / 2;
    const pm = (pb + pa) / 2;

    const p = type === 'C' ? cm : pm;

    // Validering

    const valid =
        s > 0 &&
        k > 0 &&
        t > 0 &&
        Number.isFinite(r) &&
        Number.isFinite(q);

    // Implicit volatilitet

    const v = valid
        ? implied(s, k, t, r, q, p, type)
        : NaN;

    const ok =
        valid &&
        v > 0 &&
        Number.isFinite(v);

    const b = ok
        ? bs(s, k, t, r, q, v)
        : {};

    // Forventet kursbevægelse

    const m = ok
        ? s * v * Math.sqrt(t)
        : NaN;

    const st = cm + pm;

    const pct = x =>
        Number.isFinite(x)
            ? fmt(x * 100) + ' %'
            : '—';

    // Fejlmeddelelser

    $('error').textContent =
        !valid
            ? 'Kontrollér kurs, strike, udløbsdato og renter.'
            : !ok
                ? 'Volatilitet kan ikke beregnes. Kontrollér den valgte options mid-pris.'
                : cb > ca ||
                  pb > pa ||
                  Math.min(cb, ca, pb, pa) < 0
                    ? 'Kontrollér bid/ask-priser.'
                    : '';

    // Vis optionsværdi

    metrics('valuation', [
        ['Dage til udløb', fmt(days, 0)],
        ['Implicit volatilitet', pct(v)],
        ['Call mid', fmt(cm)],
        ['Put mid', fmt(pm)],
        ['Call (teoretisk)', fmt(b.C)],
        ['Put (teoretisk)', fmt(b.P)],
        ['Valgt præmie', fmt(p)],
        ['Modelpris (valgt type)', fmt(b[type])],
        ['d1', fmt(b.d1, 4)],
        ['d2', fmt(b.d2, 4)],
        ['Udbyttefaktor', fmt(b.u, 4)]
    ]);

    // Vis forventet kursbevægelse

    metrics('movement', [
        ['Volatilitet: bevægelse', fmt(m)],
        ['Straddle: bevægelse', fmt(st)],
        ['Nedre grænse (IV)', fmt(s - m)],
        ['Øvre grænse (IV)', fmt(s + m)],
        ['Nedre grænse (straddle)', fmt(s - st)],
        ['Øvre grænse (straddle)', fmt(s + st)]
    ]);

    // Afkast

    const income = num('income');

    const ret = s > 0
        ? income / s
        : NaN;

    metrics('yield', [
        [
            'Premium krav',
            fmt(valid
                ? s * num('target') / 100 * t
                : NaN)
        ],
        [
            'Mid',
            fmt((num('bid') + num('ask')) / 2)
        ],
        [
            'Afkast',
            pct(ret)
        ],
        [
            'Årligt afkast',
            pct(t > 0 ? ret / t : NaN)
        ]
    ]);

    // Grafisk visning af kursintervaller

    const range = $('range');

    range.innerHTML = '';

    if (ok && Number.isFinite(st) && st >= 0) {

        const max = Math.max(m, st, 0.001) * 1.15;

        const x = z => 170 + 145 * z / max;

        range.innerHTML = `
            <line
                x1="170"
                x2="170"
                y1="10"
                y2="80"
                stroke="#94a3b8"
                stroke-dasharray="4 3"
            />

            <text
                x="8"
                y="15"
                font-size="11"
                fill="#536579">
                Volatilitet
            </text>

            <line
                x1="${x(-m)}"
                x2="${x(m)}"
                y1="30"
                y2="30"
                stroke="#087d82"
                stroke-width="8"
                stroke-linecap="round"
            />

            <text
                x="8"
                y="55"
                font-size="11"
                fill="#536579">
                Straddle
            </text>

            <line
                x1="${x(-st)}"
                x2="${x(st)}"
                y1="70"
                y2="70"
                stroke="#64748b"
                stroke-width="8"
                stroke-linecap="round"
            />

            <text
                x="170"
                y="96"
                text-anchor="middle"
                font-size="11"
                fill="#536579">
                Aktuel kurs
            </text>
        `;
    }
}

// Automatisk genberegning

document.addEventListener('input', update);
document.addEventListener('change', update);

// Første beregning

update();
