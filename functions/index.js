const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const STORES = [
    { id: "unamar", name: "UNAMAR" },
    { id: "macae-ii", name: "MACAE II" },
    { id: "bacaxa-ii", name: "BACAXA II" },
    { id: "copacabana", name: "COPACABANA" },
    { id: "botafogo", name: "BOTAFOGO" }
];

const DEST_EMAILS = ["joaopedrosocialm@gmail.com", "joao.oliveira@grpalvorada.com.br"];
const NOTIFY_EMAIL = "joaopedrosocialm@gmail.com";
const RESUMO_URL = "https://alvoleds-aab35.web.app/resumo.html";

function diferencaEmDias(dataAlvo, dataBase) {
    const umDiaMs = 24 * 60 * 60 * 1000;
    return Math.round((dataAlvo.getTime() - dataBase.getTime()) / umDiaMs);
}

function calcularDiasRestantes(dataSaida, hoje) {
    const saida = new Date(dataSaida + "T00:00:00");
    return Math.round((saida.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
}

function formatarDiasRestantes(diasRestantes) {
    if (diasRestantes < 0) {
        const diasAtraso = Math.abs(diasRestantes);
        return diasAtraso === 1 ? "1 dia em atraso" : `${diasAtraso} dias em atraso`;
    }
    if (diasRestantes === 0) return "vence hoje";
    if (diasRestantes === 1) return "1 dia para o vencimento";
    return `${diasRestantes} dias para o vencimento`;
}

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function agruparItensPorMarcaData(items) {
    const agrupados = new Map();

    for (const item of items) {
        const chave = `${item.nome}__${item.saida}`;
        if (!agrupados.has(chave)) {
            agrupados.set(chave, { nome: item.nome, saida: item.saida, lojas: new Set() });
        }

        const atual = agrupados.get(chave);
        (item.lojas || []).forEach((loja) => atual.lojas.add(loja));
    }

    return Array.from(agrupados.values()).map((item) => ({
        nome: item.nome,
        saida: item.saida,
        lojas: Array.from(item.lojas)
    }));
}

function agruparResumoPorMarcaData(items) {
    const agrupados = new Map();

    for (const item of items) {
        const chave = `${item.marca}__${item.dataIso}`;
        if (!agrupados.has(chave)) {
            agrupados.set(chave, {
                marca: item.marca,
                data: item.data,
                dataIso: item.dataIso,
                dias: item.dias,
                lojas: new Set()
            });
        }

        const atual = agrupados.get(chave);
        atual.lojas.add(item.loja);
    }

    return Array.from(agrupados.values())
        .map((item) => ({
            marca: item.marca,
            data: item.data,
            dataIso: item.dataIso,
            dias: item.dias,
            lojas: Array.from(item.lojas).sort((a, b) => a.localeCompare(b))
        }))
        .sort((a, b) => {
            if (a.dias !== b.dias) return a.dias - b.dias;
            if (a.dataIso !== b.dataIso) return a.dataIso.localeCompare(b.dataIso);
            return a.marca.localeCompare(b.marca);
        });
}

function gerarResumoVisualSvg(resumo, dataReferencia) {
    const largura = 1300;
    const margem = 32;
    const larguraConteudo = largura - margem * 2;
    const alturaBloco = 64;

    const secoes = [
        {
            titulo: `VENCIDOS (${resumo.vencidos.length})`,
            cor: "#ef4444",
            items: resumo.vencidos,
            emptyText: "Nenhuma marca vencida."
        },
        {
            titulo: `PROXIMOS A VENCER - ATE 3 DIAS (${resumo.proximosAVencer.length})`,
            cor: "#f59e0b",
            items: resumo.proximosAVencer,
            emptyText: "Nenhuma marca a vencer nos proximos 3 dias."
        }
    ];

    let altura = 120;
    secoes.forEach((secao) => {
        altura += 48;
        altura += secao.items.length ? secao.items.length * alturaBloco : 38;
        altura += 12;
    });
    altura += 20;

    let y = 44;
    const partes = [];
    partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">`);
    partes.push(`<rect width="100%" height="100%" fill="#0b1220"/>`);
    partes.push(`<text x="${largura / 2}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#f8fafc">RESUMO DE VENCIMENTOS - ALVO LEDS</text>`);
    y += 30;
    partes.push(`<text x="${largura / 2}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#94a3b8">Relatorio de ${escapeHtml(dataReferencia.toLocaleDateString("pt-BR"))}</text>`);
    y += 34;

    for (const secao of secoes) {
        partes.push(`<text x="${margem}" y="${y}" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="${secao.cor}">${escapeHtml(secao.titulo)}</text>`);
        y += 16;

        if (!secao.items.length) {
            y += 20;
            partes.push(`<text x="${margem}" y="${y}" font-family="Arial, sans-serif" font-size="16" fill="#9ca3af">${escapeHtml(secao.emptyText)}</text>`);
            y += 18;
            continue;
        }

        for (const item of secao.items) {
            const titulo = `${item.marca} - ${item.data} - (${formatarDiasRestantes(item.dias)})`;
            const lojas = item.lojas.join(", ");

            partes.push(`<rect x="${margem}" y="${y}" width="${larguraConteudo}" height="${alturaBloco - 10}" rx="10" fill="#111827" stroke="#1f2937"/>`);
            partes.push(`<text x="${margem + 16}" y="${y + 24}" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#e5e7eb">${escapeHtml(titulo)}</text>`);
            partes.push(`<text x="${margem + 16}" y="${y + 45}" font-family="Arial, sans-serif" font-size="14" fill="#94a3b8">${escapeHtml(lojas)}</text>`);
            y += alturaBloco;
        }

        y += 4;
    }

    partes.push(`</svg>`);
    return partes.join("");
}

function buildGroupedBlocksPorMarca(items, hoje) {
    if (!items.length) return "";

    const blocos = items
        .sort((a, b) => {
            const diasA = calcularDiasRestantes(a.saida, hoje);
            const diasB = calcularDiasRestantes(b.saida, hoje);
            if (diasA !== diasB) return diasA - diasB;
            return a.nome.localeCompare(b.nome);
        })
        .map((item) => {
            const diasRestantes = calcularDiasRestantes(item.saida, hoje);
            const diasText = formatarDiasRestantes(diasRestantes);
            const lojas = item.lojas.sort((a, b) => a.localeCompare(b));
            const titulo = `${item.nome} - ${item.saida} - (${diasText})`;
            
            return `
                <div style="background:#111;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
                    <div style="font-size:14px;font-weight:700;color:#f5f5f5;line-height:1.4;">
                        ${escapeHtml(titulo)}
                    </div>
                    <div style="color:#b0b0b0;font-size:12px;border-top:1px solid #1a1a1a;padding-top:8px;margin-top:8px;">
                        ${escapeHtml(lojas.join(", "))}
                    </div>
                </div>
            `;
        })
        .join("");

    return `<div style="margin-bottom:24px;">${blocos}</div>`;
}

async function verificarEEnviarEmail(isTeste = false) {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass }
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const fmt = (d) =>
        d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

    const logsRef = db.collection("notificacao_envios");
    const vencidos = [];      // diasParaVencer < 0
    const venceHoje = [];     // diasParaVencer === 0
    const venceEm3Dias = [];  // diasParaVencer === 3
    const enviosPendentes = [];

    for (const store of STORES) {
        const snap = await db.collection("painel").doc(store.id).collection("marcas").get();
        snap.forEach((doc) => {
            const data = doc.data();
            if (!data.saida || data.saida === "indeterminado") return;

            const saida = new Date(data.saida + "T00:00:00");
            if (Number.isNaN(saida.getTime())) return;

            const diasParaVencer = diferencaEmDias(saida, hoje);

            // Notificar apenas: vencidas, vence hoje (D0), vence em 3 dias (D3)
            if (diasParaVencer > 3) return;
            if (diasParaVencer === 1 || diasParaVencer === 2) return;

            const item = { loja: store.name, lojas: [store.name], nome: data.nome, saida: data.saida };

            // Vencidas: chave diaria para reenviar todos os dias ate ser resolvida
            const tipo = diasParaVencer < 0
                ? `vencido__${hoje.toISOString().slice(0, 10)}`
                : `D${diasParaVencer}`;
            const logId = `${store.id}__${doc.id}__${data.saida}__${tipo}`;

            enviosPendentes.push({
                logId,
                payload: {
                    lojaId: store.id,
                    lojaNome: store.name,
                    marcaId: doc.id,
                    marcaNome: data.nome,
                    dataSaida: data.saida,
                    tipo,
                    criadoEm: admin.firestore.FieldValue.serverTimestamp()
                }
            });
             

            if (diasParaVencer < 0) {
                vencidos.push(item);
            } else if (diasParaVencer === 0) {
                venceHoje.push(item);
            } else {
                venceEm3Dias.push(item);
            }
        });
    }

    let itensVencidosParaEnviar = vencidos;
    let itensHojeParaEnviar = venceHoje;
    let itensEm3DiasParaEnviar = venceEm3Dias;

    if (!isTeste) {
        const porLogId = new Map(enviosPendentes.map((p) => [p.logId, p]));
        const ids = [...porLogId.keys()];
        const jaEnviados = new Set();

        for (let i = 0; i < ids.length; i += 10) {
            const fatia = ids.slice(i, i + 10);
            const snapshot = await db.getAll(...fatia.map((id) => logsRef.doc(id)));
            snapshot.forEach((docSnap) => {
                if (docSnap.exists) jaEnviados.add(docSnap.id);
            });
        }

        itensVencidosParaEnviar = [];
        itensHojeParaEnviar = [];
        itensEm3DiasParaEnviar = [];

        for (const p of enviosPendentes) {
            if (jaEnviados.has(p.logId)) continue;
            const item = { nome: p.payload.marcaNome, saida: p.payload.dataSaida, lojas: [p.payload.lojaNome] };
            if (p.payload.tipo.startsWith("vencido")) {
                itensVencidosParaEnviar.push(item);
            } else if (p.payload.tipo === "D0") {
                itensHojeParaEnviar.push(item);
            } else {
                itensEm3DiasParaEnviar.push(item);
            }
        }

        enviosPendentes.length = 0;
        for (const p of porLogId.values()) {
            if (!jaEnviados.has(p.logId)) enviosPendentes.push(p);
        }
    }

    const totalAlertas = itensVencidosParaEnviar.length + itensHojeParaEnviar.length + itensEm3DiasParaEnviar.length;

    if (!isTeste && totalAlertas === 0) {
        console.log("Sem alertas. Email nao enviado.");
        return { enviado: false, total: 0 };
    }

    const sections = [];

    if (itensVencidosParaEnviar.length) {
        const agrupados = agruparItensPorMarcaData(itensVencidosParaEnviar);
        sections.push(
            `<h3 style="color:#ef4444;margin:0 0 10px;">&#9888; Marcas Vencidas (${agrupados.length})</h3>` +
            buildGroupedBlocksPorMarca(agrupados, hoje) +
            `<div style="text-align:center;margin:16px 0 28px;">` +
            `<a href="${RESUMO_URL}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;">` +
            `&#9888; Acessar Resumo e Decidir</a></div>`
        );
    }

    if (itensHojeParaEnviar.length) {
        const agrupados = agruparItensPorMarcaData(itensHojeParaEnviar);
        sections.push(
            `<h3 style="color:#f59e0b;margin:0 0 10px;">Marcas que vencem HOJE (${agrupados.length})</h3>` +
            buildGroupedBlocksPorMarca(agrupados, hoje) +
            `<div style="text-align:center;margin:16px 0 28px;">` +
            `<a href="${RESUMO_URL}" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;">` +
            `&#128197; Acessar Resumo e Decidir</a></div>`
        );
    }

    if (itensEm3DiasParaEnviar.length) {
        const agrupados = agruparItensPorMarcaData(itensEm3DiasParaEnviar);
        sections.push(
            `<h3 style="color:#f97316;margin:0 0 10px;">Marcas que vencem em 3 dias (${agrupados.length})</h3>` +
            buildGroupedBlocksPorMarca(agrupados, hoje)
        );
    }

    const testeBanner = isTeste
        ? `<div style="background:#1e3a5f;border:1px solid #3b82f6;border-radius:8px;padding:12px 16px;margin-bottom:24px;color:#93c5fd;font-size:13px;"><strong>EMAIL DE TESTE</strong> - disparado manualmente pelo painel. O sistema de notificacoes esta funcionando.</div>`
        : "";

    const corpoPrincipal = sections.join("");

    const htmlBody = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#0d0d0d;color:#eee;padding:24px;"><div style="max-width:640px;margin:auto;"><div style="background:#1a1a1a;border-radius:12px;padding:24px 32px;margin-bottom:24px;"><h1 style="margin:0;color:#fff;font-size:22px;">Alvo Leds - Aviso de Vencimento</h1><p style="color:#aaa;margin:8px 0 0;">Relatorio do dia ${fmt(hoje)} - ${totalAlertas} alerta(s)</p></div>${testeBanner}${corpoPrincipal}<p style="color:#555;font-size:12px;text-align:center;margin-top:32px;">Painel Alvo Leds - notificacao automatica</p></div></body></html>`;

    const assunto = isTeste
        ? `[TESTE] Alvo Leds - Sistema de notificacoes funcionando`
        : itensVencidosParaEnviar.length
            ? `Alvo Leds - ${itensVencidosParaEnviar.length} marca(s) vencida(s) aguardando decisao`
            : itensHojeParaEnviar.length
                ? `Alvo Leds - ${itensHojeParaEnviar.length} marca(s) vencem hoje`
                : `Alvo Leds - ${itensEm3DiasParaEnviar.length} marca(s) vencem em 3 dias`;

    await transporter.sendMail({
        from: `"Alvo Leds Painel" <${gmailUser}>`,
        to: DEST_EMAILS.join(","),
        subject: assunto,
        html: htmlBody
    });

    if (!isTeste && enviosPendentes.length) {
        const batch = db.batch();
        enviosPendentes.forEach((p) => {
            batch.set(logsRef.doc(p.logId), p.payload, { merge: false });
        });
        await batch.commit();
    }

    console.log(`Email ${isTeste ? "de teste" : "de alertas"} enviado. Alertas: ${totalAlertas}`);
    return { enviado: true, total: totalAlertas };
}

// Verificacao diaria as 08:00 (Brasilia). Email so e enviado quando ha marcas vencidas,
// vencendo hoje (D0) ou vencendo em exatamente 3 dias (D3).
exports.notificarVencimentoMarcas = onSchedule(
    { schedule: "0 11 * * *", timeZone: "America/Sao_Paulo" },
    async () => { await verificarEEnviarEmail(false); }
);

// Endpoint HTTP de teste
exports.testarEmailAgora = onRequest(
    { cors: true },
    async (req, res) => {
        try {
            const resultado = await verificarEEnviarEmail(true);
            res.status(200).json({ ok: true, mensagem: "Email de teste enviado!", alertas: resultado.total });
        } catch (e) {
            console.error("Erro:", e);
            res.status(500).json({ ok: false, mensagem: e.message });
        }
    }
);

// Função para gerar resumo visual (SVG)
async function gerarResumoVencimentos() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const vencidos = [];
    const proximosAVencer = [];

    for (const store of STORES) {
        const snap = await db.collection("painel").doc(store.id).collection("marcas").get();
        snap.forEach((doc) => {
            const data = doc.data();
            if (!data.saida || data.saida === "indeterminado") return;

            const saida = new Date(data.saida + "T00:00:00");
            if (Number.isNaN(saida.getTime())) return;

            const diasParaVencer = diferencaEmDias(saida, hoje);
            
            if (diasParaVencer < 0) {
                vencidos.push({
                    marca: data.nome,
                    loja: store.name,
                    dias: diasParaVencer,
                    dataIso: data.saida,
                    data: saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                });
            } else if (diasParaVencer <= 3) {
                proximosAVencer.push({
                    marca: data.nome,
                    loja: store.name,
                    dias: diasParaVencer,
                    dataIso: data.saida,
                    data: saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                });
            }
        });
    }

    return {
        vencidos: agruparResumoPorMarcaData(vencidos),
        proximosAVencer: agruparResumoPorMarcaData(proximosAVencer)
    };
}

// Endpoint para gerar resumo visual
exports.gerarResumoVisual = onRequest(
    { cors: true },
    async (req, res) => {
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        if (req.method !== "GET") {
            res.status(405).json({ ok: false, mensagem: "Metodo nao permitido" });
            return;
        }
        
        try {
            const resumo = await gerarResumoVencimentos();
            const svg = gerarResumoVisualSvg(resumo, new Date());

            res.set("Content-Type", "image/svg+xml; charset=utf-8");
            res.set("Cache-Control", "no-store");
            res.status(200).send(svg);
        } catch (e) {
            console.error("Erro ao gerar resumo:", e);
            res.set("Content-Type", "application/json");
            res.status(500).json({ ok: false, mensagem: e.message });
        }
    }
);

// Trigger: envia email de notificacao quando o usuario toma uma decisao no resumo.html
exports.notificarDecisaoMarca = onDocumentCreated("decisoes_marcas/{docId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const decisao = snap.data();
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass }
    });

    const marcaNome = escapeHtml(decisao.marcaNome || "?");
    let assunto, corpoMsg;

    if (decisao.tipo === "remocao") {
        assunto = `Alvo Leds - Remocao confirmada: "${decisao.marcaNome}"`;
        corpoMsg =
            `<p style="font-size:15px;">Foi definido que a marca <strong style="color:#ef4444;">${marcaNome}</strong> deve ser <strong>removida</strong>.</p>` +
            `<p style="color:#aaa;font-size:13px;margin-top:8px;">Data de saida original: ${escapeHtml(decisao.dataAntiga || "")}</p>`;
    } else if (decisao.tipo === "nova_data") {
        const novaDataFmt = escapeHtml(
            (decisao.novaData || "").split("-").reverse().join("/")
        );
        assunto = `Alvo Leds - Nova data definida para "${decisao.marcaNome}"`;
        corpoMsg =
            `<p style="font-size:15px;">A marca <strong style="color:#f59e0b;">${marcaNome}</strong> recebeu uma nova data de saida: <strong>${novaDataFmt}</strong>.</p>` +
            `<p style="color:#aaa;font-size:13px;margin-top:8px;">Data anterior: ${escapeHtml(decisao.dataAntiga || "")}</p>`;
    } else {
        return;
    }

    const htmlBody =
        `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#0d0d0d;color:#eee;padding:24px;">` +
        `<div style="max-width:560px;margin:auto;">` +
        `<div style="background:#1a1a1a;border-radius:12px;padding:24px 32px;margin-bottom:20px;">` +
        `<h1 style="margin:0;color:#fff;font-size:20px;">Alvo Leds - Decisao Registrada</h1></div>` +
        `<div style="background:#111;border:1px solid #2a2a2a;border-radius:10px;padding:20px 24px;">` +
        corpoMsg +
        `</div>` +
        `<p style="color:#555;font-size:12px;text-align:center;margin-top:28px;">Decisao registrada via Resumo de Vencimentos.</p>` +
        `</div></body></html>`;

    try {
        await transporter.sendMail({
            from: `"Alvo Leds Painel" <${gmailUser}>`,
            to: NOTIFY_EMAIL,
            subject: assunto,
            html: htmlBody
        });
        console.log("Email de decisao enviado:", assunto);
    } catch (e) {
        console.error("Erro ao enviar email de decisao:", e);
    }
});
