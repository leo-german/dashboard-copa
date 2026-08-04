// Archivo de lógica de la aplicación del Dashboard

// Mapeo de nombres de meses en español
const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Variables globales para los datos
let rawData = null;
let charts = {}; // Guardará las instancias de Chart.js para poder destruirlas al actualizar

// Elementos de la UI
const selectGeneral = document.getElementById('filter-general');
const selectFinancial = document.getElementById('filter-financial');
const selectCurrency = document.getElementById('filter-currency');
const selectCategoryType = document.getElementById('filter-category-type');
const selectYearHistorical = document.getElementById('filter-year-historical'); // Selector Histórico
const syncTimestampEl = document.getElementById('sync-timestamp');

// Helper para convertir "YYYY-MM-DD" o "YYYY-MM" en "Mes AAAA"
function formatMonthYear(ymString) {
    const parts = ymString.split('-');
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    return `${MESES[monthIdx]} ${year}`;
}

// Helper para parsear "YYYY-MM-DD" en objeto fecha local
function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2] || 1);
}

// Helper para obtener el mes anterior en formato "YYYY-MM"
function getPreviousMonth(ymString) {
    const parts = ymString.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1; // 0-indexed en JS Date
    
    if (month === 0) {
        month = 12;
        year -= 1;
    }
    
    return `${year}-${String(month).padStart(2, '0')}`;
}

// Helper para formatear moneda ARS/USD
function formatCurrency(amount, currency = 'ARS') {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    }).format(amount);
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si los datos se han cargado de forma local (file:// compatible sin CORS)
    if (typeof dashboardData !== 'undefined') {
        console.log('Cargando datos locales de CoPA mediante variable de script.');
        rawData = dashboardData;
        
        // Mostrar última fecha de actualización
        if (rawData.last_updated) {
            const date = new Date(rawData.last_updated);
            syncTimestampEl.textContent = date.toLocaleString('es-AR');
        }
        
        initFilters();
        updateDashboard();
    } else {
        // Fallback a fetch por si se abre desde un servidor web (HTTP/S)
        console.log('dashboardData no definido. Intentando fetch a data/metrics.json...');
        fetch('data/metrics.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('No se pudo cargar el archivo metrics.json.');
                }
                return response.json();
            })
            .then(data => {
                rawData = data;
                
                // Mostrar última fecha de actualización
                if (data.last_updated) {
                    const date = new Date(data.last_updated);
                    syncTimestampEl.textContent = date.toLocaleString('es-AR');
                }
                
                initFilters();
                updateDashboard();
            })
            .catch(err => {
                console.error('Error al cargar datos del dashboard:', err);
                alert('Error al cargar los datos del dashboard. Por favor, asegúrate de que el script de sincronización se haya ejecutado.');
            });
    }
        
    // Listeners para los filtros
    selectGeneral.addEventListener('change', updateDashboard);
    selectFinancial.addEventListener('change', updateFinancialSection);
    if (selectCurrency) {
        selectCurrency.addEventListener('change', updateFinancialSection);
    }
    if (selectCategoryType) {
        selectCategoryType.addEventListener('change', () => {
            const selectedGeneral = selectGeneral.value;
            updateBaseDeDatosSection(selectedGeneral);
        });
    }
    if (selectYearHistorical) {
        selectYearHistorical.addEventListener('change', updateHistoricalSection);
    }
});

// Inicializar los filtros dropdown dinámicamente
function initFilters() {
    // 1. Obtener meses únicos para el Filtro General (base_de_datos, expedientes, rendicion_vep_scit)
    const generalMonths = new Set();
    
    if (rawData.base_de_datos) {
        rawData.base_de_datos.forEach(item => {
            if (item.periodo) generalMonths.add(item.periodo.substring(0, 7));
        });
    }
    if (rawData.expedientes) {
        rawData.expedientes.forEach(item => {
            if (item.fecha) generalMonths.add(item.fecha.substring(0, 7));
        });
    }
    if (rawData.rendicion_vep_scit) {
        rawData.rendicion_vep_scit.forEach(item => {
            if (item.fecha) generalMonths.add(item.fecha.substring(0, 7));
        });
    }
    
    const sortedGeneralMonths = Array.from(generalMonths).sort().reverse(); // De más nuevo a más viejo
    
    selectGeneral.innerHTML = '';
    sortedGeneralMonths.forEach(ym => {
        const option = document.createElement('option');
        option.value = ym;
        option.textContent = formatMonthYear(ym);
        selectGeneral.appendChild(option);
    });
    
    if (sortedGeneralMonths.length > 0) {
        selectGeneral.value = sortedGeneralMonths[0];
    }

    // 2. Obtener meses únicos para el Filtro Financiero (capital_financiero)
    const financialMonths = new Set();
    if (rawData.capital_financiero) {
        rawData.capital_financiero.forEach(item => {
            if (item.fecha_constitucion) {
                financialMonths.add(item.fecha_constitucion.substring(0, 7));
            }
        });
    }
    
    const sortedFinancialMonths = Array.from(financialMonths).sort().reverse();
    
    selectFinancial.innerHTML = '';
    sortedFinancialMonths.forEach(ym => {
        const option = document.createElement('option');
        option.value = ym;
        option.textContent = formatMonthYear(ym);
        selectFinancial.appendChild(option);
    });
    
    if (sortedFinancialMonths.length > 0) {
        selectFinancial.value = sortedFinancialMonths[0];
    }

    // 3. Obtener años únicos para el Filtro Histórico Anual
    const historicalYears = new Set();
    if (rawData.base_de_datos) {
        rawData.base_de_datos.forEach(item => {
            if (item.periodo) historicalYears.add(item.periodo.substring(0, 4));
        });
    }
    if (rawData.expedientes) {
        rawData.expedientes.forEach(item => {
            if (item.fecha) historicalYears.add(item.fecha.substring(0, 4));
        });
    }
    
    const sortedYears = Array.from(historicalYears).sort().reverse();
    
    if (selectYearHistorical) {
        selectYearHistorical.innerHTML = '';
        sortedYears.forEach(yr => {
            const option = document.createElement('option');
            option.value = yr;
            option.textContent = yr;
            selectYearHistorical.appendChild(option);
        });
        
        if (sortedYears.length > 0) {
            selectYearHistorical.value = sortedYears[0];
        }
    }
}

// Cambiar de pestaña en las tablas de detalle
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');
    
    document.getElementById(tabId).classList.add('active');
}

// Función principal de actualización del Dashboard completo
function updateDashboard() {
    const selectedGeneral = selectGeneral.value;
    
    if (!rawData) return;
    
    updateBaseDeDatosSection(selectedGeneral);
    updateExpedientesSection(selectedGeneral);
    updateVepSection(selectedGeneral);
    updateHistoricalSection(); // Actualiza la sección histórica
    updateFinancialSection();
}

// ----------------------------------------------------
// SECCIÓN 1: BASE DE DATOS (INGRESOS Y EGRESOS)
// ----------------------------------------------------
function updateBaseDeDatosSection(selectedYm) {
    const prevYm = getPreviousMonth(selectedYm);
    
    const currentData = rawData.base_de_datos.filter(item => item.periodo && item.periodo.startsWith(selectedYm));
    const prevData = rawData.base_de_datos.filter(item => item.periodo && item.periodo.startsWith(prevYm));
    
    let ingresosTotal = 0;
    let ingresosOp = 0;
    let ingresosExt = 0;
    
    let egresosTotal = 0;
    let egresosOp = 0;
    let egresosExt = 0;
    
    currentData.forEach(item => {
        const monto = item.monto || 0;
        if (item.tipo === 'Ingreso') {
            ingresosTotal += monto;
            if (item.subtipo === 'Operativo') ingresosOp += monto;
            else if (item.subtipo === 'Extraordinario') ingresosExt += monto;
        } else if (item.tipo === 'Egreso') {
            egresosTotal += monto;
            if (item.subtipo === 'Operativo') egresosOp += monto;
            else if (item.subtipo === 'Extraordinario') egresosExt += monto;
        }
    });
    
    const balanceTotal = ingresosTotal - egresosTotal;
    const balanceOperativo = ingresosOp - egresosOp;

    let prevIngresosTotal = 0;
    let prevIngresosOp = 0;
    let prevEgresosTotal = 0;
    let prevEgresosOp = 0;
    
    prevData.forEach(item => {
        const monto = item.monto || 0;
        if (item.tipo === 'Ingreso') {
            prevIngresosTotal += monto;
            if (item.subtipo === 'Operativo') prevIngresosOp += monto;
        } else if (item.tipo === 'Egreso') {
            prevEgresosTotal += monto;
            if (item.subtipo === 'Operativo') prevEgresosOp += monto;
        }
    });
    
    const prevBalanceTotal = prevIngresosTotal - prevEgresosTotal;
    const prevBalanceOperativo = prevIngresosOp - prevEgresosOp;
    
    document.getElementById('kpi-ingresos-total').textContent = formatCurrency(ingresosTotal);
    document.getElementById('kpi-ingresos-op').textContent = formatCurrency(ingresosOp).split(',')[0];
    document.getElementById('kpi-ingresos-ext').textContent = formatCurrency(ingresosExt).split(',')[0];
    renderDelta('kpi-ingresos-delta', ingresosTotal, prevIngresosTotal, true);
    
    document.getElementById('kpi-egresos-total').textContent = formatCurrency(egresosTotal);
    document.getElementById('kpi-egresos-op').textContent = formatCurrency(egresosOp).split(',')[0];
    document.getElementById('kpi-egresos-ext').textContent = formatCurrency(egresosExt).split(',')[0];
    renderDelta('kpi-egresos-delta', egresosTotal, prevEgresosTotal, false);
    
    document.getElementById('kpi-balance-operativo').textContent = formatCurrency(balanceOperativo);
    const balanceOperativoTypeEl = document.getElementById('kpi-balance-operativo-type');
    if (balanceOperativo >= 0) {
        balanceOperativoTypeEl.textContent = 'Superávit Operativo';
        balanceOperativoTypeEl.style.color = 'var(--copa-success)';
    } else {
        balanceOperativoTypeEl.textContent = 'Déficit Operativo';
        balanceOperativoTypeEl.style.color = 'var(--copa-danger)';
    }
    renderDelta('kpi-balance-operativo-delta', balanceOperativo, prevBalanceOperativo, true);

    document.getElementById('kpi-balance-total').textContent = formatCurrency(balanceTotal);
    const balanceTypeEl = document.getElementById('kpi-balance-type');
    if (balanceTotal >= 0) {
        balanceTypeEl.textContent = 'Superávit Financiero';
        balanceTypeEl.style.color = 'var(--copa-success)';
    } else {
        balanceTypeEl.textContent = 'Déficit Financiero';
        balanceTypeEl.style.color = 'var(--copa-danger)';
    }
    renderDelta('kpi-balance-delta', balanceTotal, prevBalanceTotal, true);

    // --- GRÁFICO 1: Comparativo Barras Apiladas (Ingresos vs Egresos) ---
    const ctxBar = document.getElementById('chart-ingresos-egresos').getContext('2d');
    if (charts.ingresosEgresos) charts.ingresosEgresos.destroy();
    
    charts.ingresosEgresos = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Ingresos', 'Egresos'],
            datasets: [
                {
                    label: 'Operativo',
                    data: [ingresosOp, egresosOp],
                    backgroundColor: ['#2E7D32', '#D32F2F'],
                    borderRadius: 4
                },
                {
                    label: 'Extraordinario',
                    data: [ingresosExt, egresosExt],
                    backgroundColor: ['#81C784', '#EF5350'],
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    grid: { color: '#F0F0F0' },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString('es-AR');
                        }
                    }
                }
            }
        }
    });

    // --- GRÁFICO 2: Desglose por Categoría ---
    const categoryType = selectCategoryType ? selectCategoryType.value : 'Ingreso';
    const catMap = {};
    currentData.forEach(item => {
        if (item.tipo === categoryType) {
            const cat = item.categoria || 'Sin Categoría';
            catMap[cat] = (catMap[cat] || 0) + (item.monto || 0);
        }
    });
    
    const sortedCats = Object.entries(catMap)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 6);
        
    const catLabels = sortedCats.map(c => c[0]);
    const catValues = sortedCats.map(c => c[1]);
    
    const ctxCat = document.getElementById('chart-categorias-base').getContext('2d');
    if (charts.categoriasBase) charts.categoriasBase.destroy();
    
    charts.categoriasBase = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: catLabels,
            datasets: [{
                label: categoryType === 'Ingreso' ? 'Monto por Categoría (Ingresos)' : 'Monto por Categoría (Egresos)',
                data: catValues,
                backgroundColor: categoryType === 'Ingreso' ? '#2E7D32' : '#D32F2F',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Monto: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#F0F0F0' },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString('es-AR');
                        }
                    }
                },
                y: { grid: { display: false } }
            }
        }
    });

    const tbody = document.getElementById('table-base-body');
    tbody.innerHTML = '';
    
    currentData.slice(0, 15).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.periodo ? formatMonthYear(item.periodo.substring(0,7)) : '-'}</td>
            <td><strong style="color: ${item.tipo === 'Ingreso' ? 'var(--copa-success)' : 'var(--copa-danger)'}">${item.tipo}</strong></td>
            <td>${item.subtipo || '-'}</td>
            <td>${item.categoria || '-'}</td>
            <td><strong>${formatCurrency(item.monto)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
    if (currentData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--copa-text-light);">No hay registros en este mes.</td></tr>';
    }
}

// ----------------------------------------------------
// SECCIÓN 2: EXPEDIENTES
// ----------------------------------------------------
function updateExpedientesSection(selectedYm) {
    const prevYm = getPreviousMonth(selectedYm);
    
    const currentExp = rawData.expedientes.filter(item => item.fecha && item.fecha.startsWith(selectedYm));
    const prevExp = rawData.expedientes.filter(item => item.fecha && item.fecha.startsWith(prevYm));
    
    let total = 0;
    let comunes = 0;
    let ccu = 0;
    let vep = 0;
    
    currentExp.forEach(item => {
        total += item.total || 0;
        comunes += item.comunes || 0;
        ccu += item.ccu || 0;
        vep += item.vep || 0;
    });
    
    let prevTotal = 0;
    prevExp.forEach(item => {
        prevTotal += item.total || 0;
    });
    
    document.getElementById('kpi-exp-total').textContent = total.toLocaleString('es-AR');
    renderDelta('kpi-exp-delta', total, prevTotal, true);
    
    document.getElementById('kpi-exp-comunes').textContent = comunes.toLocaleString('es-AR');
    document.getElementById('kpi-exp-comunes-pct').textContent = total > 0 ? `${Math.round((comunes/total)*100)}% del total` : '0% del total';
    
    document.getElementById('kpi-exp-ccu').textContent = ccu.toLocaleString('es-AR');
    document.getElementById('kpi-exp-ccu-pct').textContent = total > 0 ? `${Math.round((ccu/total)*100)}% del total` : '0% del total';
    
    document.getElementById('kpi-exp-vep').textContent = vep.toLocaleString('es-AR');
    document.getElementById('kpi-exp-vep-pct').textContent = total > 0 ? `${Math.round((vep/total)*100)}% del total` : '0% del total';

    // --- GRÁFICO 3: Evolución Histórica de los últimos 6 meses de Expedientes ---
    const last6Months = [];
    let tempYm = selectedYm;
    for (let i = 0; i < 6; i++) {
        last6Months.unshift(tempYm);
        tempYm = getPreviousMonth(tempYm);
    }
    
    const historicalData = last6Months.map(ym => {
        const filtered = rawData.expedientes.filter(item => item.fecha && item.fecha.startsWith(ym));
        let sumTotal = 0, sumComunes = 0, sumCcu = 0, sumVep = 0;
        filtered.forEach(f => {
            sumTotal += f.total || 0;
            sumComunes += f.comunes || 0;
            sumCcu += f.ccu || 0;
            sumVep += f.vep || 0;
        });
        return { ym, total: sumTotal, comunes: sumComunes, ccu: sumCcu, vep: sumVep };
    });
    
    const ctxExp = document.getElementById('chart-expedientes').getContext('2d');
    if (charts.expedientes) charts.expedientes.destroy();
    
    charts.expedientes = new Chart(ctxExp, {
        type: 'line',
        data: {
            labels: historicalData.map(d => formatMonthYear(d.ym)),
            datasets: [
                {
                    label: 'Total Expedientes',
                    data: historicalData.map(d => d.total),
                    borderColor: 'var(--copa-red)',
                    backgroundColor: 'rgba(211, 47, 47, 0.05)',
                    borderWidth: 3,
                    fill: true,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: 'var(--copa-red)',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    tension: 0.15
                },
                {
                    label: 'Comunes',
                    data: historicalData.map(d => d.comunes),
                    borderColor: '#757575',
                    borderWidth: 2,
                    pointRadius: 4,
                    fill: false,
                    tension: 0.15
                },
                {
                    label: 'CCU',
                    data: historicalData.map(d => d.ccu),
                    borderColor: '#212121',
                    borderWidth: 2,
                    pointRadius: 4,
                    fill: false,
                    tension: 0.15
                },
                {
                    label: 'VEP',
                    data: historicalData.map(d => d.vep),
                    borderColor: '#FF8A80',
                    borderWidth: 2,
                    pointRadius: 4,
                    fill: false,
                    tension: 0.15
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: 'Inter' } }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: '#F0F0F0' }, min: 0 }
            }
        }
    });
}

// ----------------------------------------------------
// SECCIÓN 3: RENDICIÓN VEP_SCIT
// ----------------------------------------------------
function updateVepSection(selectedYm) {
    const prevYm = getPreviousMonth(selectedYm);
    
    const currentVep = rawData.rendicion_vep_scit.filter(item => item.fecha && item.fecha.startsWith(selectedYm));
    const prevVep = rawData.rendicion_vep_scit.filter(item => item.fecha && item.fecha.startsWith(prevYm));
    
    let ingresos = 0;
    let gastos = 0;
    
    currentVep.forEach(item => {
        const monto = item.monto || 0;
        if (item.tipo === 'Ingreso') ingresos += monto;
        else if (item.tipo === 'Gasto') gastos += monto;
    });
    
    const balance = ingresos - gastos;
    
    let prevIngresos = 0;
    let prevGastos = 0;
    prevVep.forEach(item => {
        const monto = item.monto || 0;
        if (item.tipo === 'Ingreso') prevIngresos += monto;
        else if (item.tipo === 'Gasto') prevGastos += monto;
    });
    
    document.getElementById('kpi-vep-ingresos').textContent = formatCurrency(ingresos);
    renderDelta('kpi-vep-ingresos-delta', ingresos, prevIngresos, true);
    
    document.getElementById('kpi-vep-gastos').textContent = formatCurrency(gastos);
    renderDelta('kpi-vep-gastos-delta', gastos, prevGastos, false);
    
    document.getElementById('kpi-vep-balance').textContent = formatCurrency(balance);
    const balanceVepTypeEl = document.getElementById('kpi-vep-type');
    if (balance >= 0) {
        balanceVepTypeEl.textContent = 'Balance VEP Superavitario';
        balanceVepTypeEl.style.color = 'var(--copa-success)';
    } else {
        balanceVepTypeEl.textContent = 'Balance VEP Deficitario';
        balanceVepTypeEl.style.color = 'var(--copa-danger)';
    }

    // --- GRÁFICO 4: Comparación Ingresos vs Egresos VEP_SCIT ---
    const ctxVepBar = document.getElementById('chart-vep-rendicion').getContext('2d');
    if (charts.vepRendicion) charts.vepRendicion.destroy(); // Corregido: Destrucción previa
    
    charts.vepRendicion = new Chart(ctxVepBar, {
        type: 'bar',
        data: {
            labels: ['Ingresos VEP', 'Gastos VEP'],
            datasets: [{
                label: 'Rendición Mensual',
                data: [ingresos, gastos],
                backgroundColor: ['#2E7D32', '#D32F2F'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    grid: { color: '#F0F0F0' },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString('es-AR');
                        }
                    }
                }
            }
        }
    });

    // --- GRÁFICO 5: Histórico VEP_SCIT (Últimos 6 meses) ---
    const last6Months = [];
    let tempYm = selectedYm;
    for (let i = 0; i < 6; i++) {
        last6Months.unshift(tempYm);
        tempYm = getPreviousMonth(tempYm);
    }
    
    const historicalVepData = last6Months.map(ym => {
        const filtered = rawData.rendicion_vep_scit.filter(item => item.fecha && item.fecha.startsWith(ym));
        let sumIng = 0, sumGast = 0;
        filtered.forEach(f => {
            if (f.tipo === 'Ingreso') sumIng += f.monto || 0;
            else if (f.tipo === 'Gasto') sumGast += f.monto || 0;
        });
        return { ym, ingresos: sumIng, gastos: sumGast };
    });
    
    const ctxVepHist = document.getElementById('chart-vep-historico').getContext('2d');
    if (charts.vepHistorico) charts.vepHistorico.destroy();
    
    charts.vepHistorico = new Chart(ctxVepHist, {
        type: 'bar',
        data: {
            labels: historicalVepData.map(d => formatMonthYear(d.ym)),
            datasets: [
                {
                    label: 'Ingresos',
                    data: historicalVepData.map(d => d.ingresos),
                    backgroundColor: '#2E7D32',
                    borderRadius: 4
                },
                {
                    label: 'Gastos',
                    data: historicalVepData.map(d => d.gastos),
                    backgroundColor: '#D32F2F',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: 'Inter' } }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    grid: { color: '#F0F0F0' },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString('es-AR');
                        }
                    }
                }
            }
        }
    });

    const tbody = document.getElementById('table-vep-body');
    tbody.innerHTML = '';
    currentVep.slice(0, 15).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.fecha ? formatMonthYear(item.fecha.substring(0,7)) : '-'}</td>
            <td><strong style="color: ${item.tipo === 'Ingreso' ? 'var(--copa-success)' : 'var(--copa-danger)'}">${item.tipo}</strong></td>
            <td>${item.concepto || '-'}</td>
            <td><strong>${formatCurrency(item.monto)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
    if (currentVep.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--copa-text-light);">No hay registros en este mes.</td></tr>';
    }
}

// ----------------------------------------------------
// SECCIÓN 4: CAPITAL FINANCIERO (FILTRO EXCLUSIVO)
// ----------------------------------------------------
function updateFinancialSection() {
    const selectedYm = selectFinancial.value;
    const selectedCurrency = selectCurrency ? selectCurrency.value : 'ARS';
    if (!rawData || !selectedYm) return;
    
    const currentCap = rawData.capital_financiero.filter(item => 
        item.fecha_constitucion && 
        item.fecha_constitucion.startsWith(selectedYm) &&
        (item.moneda || 'ARS').toUpperCase() === selectedCurrency.toUpperCase()
    );
    
    let totalCapital = 0;
    let totalIntereses = 0;
    
    let fciCap = 0;
    let plazoFijoCap = 0;
    let liquidezCap = 0;
    
    let tnaPonderadaNumerador = 0;
    const entidadesMap = {};
    
    currentCap.forEach(item => {
        const capital = item.capital || 0;
        const interes = item.interes || 0;
        const tna = item.tna || 0;
        const tipo = item.tipo_activo || 'Otro';
        const entidad = item.entidad || 'Sin Entidad';
        
        totalCapital += capital;
        totalIntereses += interes;
        
        if (tipo === 'FCI') fciCap += capital;
        else if (tipo === 'Plazo fijo') plazoFijoCap += capital;
        else if (tipo === 'Liquidez') liquidezCap += capital;
        
        tnaPonderadaNumerador += (capital * tna);
        
        if (!entidadesMap[entidad]) {
            entidadesMap[entidad] = { capital: 0, interes: 0 };
        }
        entidadesMap[entidad].capital += capital;
        entidadesMap[entidad].interes += interes;
    });
    
    const tnaPromedio = totalCapital > 0 ? (tnaPonderadaNumerador / totalCapital) : 0;
    
    document.getElementById('kpi-cap-total').textContent = formatCurrency(totalCapital, selectedCurrency);
    document.getElementById('kpi-cap-interes').textContent = formatCurrency(totalIntereses, selectedCurrency);
    document.getElementById('kpi-cap-tna').textContent = `${tnaPromedio.toFixed(2)}%`;
    
    const monedaEl = document.getElementById('kpi-cap-moneda');
    monedaEl.textContent = selectedCurrency;

    // --- GRÁFICO 6: Distribución de Cartera (Doughnut) ---
    const ctxCapDist = document.getElementById('chart-cap-distribucion').getContext('2d');
    if (charts.capDistribucion) charts.capDistribucion.destroy();
    
    charts.capDistribucion = new Chart(ctxCapDist, {
        type: 'doughnut',
        data: {
            labels: ['Plazo fijo', 'FCI', 'Liquidez'],
            datasets: [{
                data: [plazoFijoCap, fciCap, liquidezCap],
                backgroundColor: ['#D32F2F', '#1976D2', '#FBC02D'],
                borderWidth: 2,
                borderColor: '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const pct = totalCapital > 0 ? ((val/totalCapital)*100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(val, selectedCurrency)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // --- GRÁFICO 7: Crecimiento de Capital vs Intereses por Entidad ---
    const entidadesLabels = Object.keys(entidadesMap);
    const entidadesCapital = entidadesLabels.map(ent => entidadesMap[ent].capital);
    const entidadesInteres = entidadesLabels.map(ent => entidadesMap[ent].interes);
    
    const ctxCapEvol = document.getElementById('chart-cap-evolucion').getContext('2d');
    if (charts.capEvolucion) charts.capEvolucion.destroy();
    
    charts.capEvolucion = new Chart(ctxCapEvol, {
        type: 'bar',
        data: {
            labels: entidadesLabels,
            datasets: [
                {
                    label: 'Capital Constituido',
                    data: entidadesCapital,
                    backgroundColor: '#1565C0',
                    borderRadius: 4
                },
                {
                    label: 'Intereses Ganados',
                    data: entidadesInteres,
                    backgroundColor: '#EF6C00',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.raw, selectedCurrency)}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    grid: { color: '#F0F0F0' },
                    ticks: {
                        callback: function(value) {
                            const symbol = selectedCurrency === 'USD' ? 'US$' : '$';
                            return symbol + value.toLocaleString('es-AR');
                        }
                    }
                }
            }
        }
    });

    const tbody = document.getElementById('table-cap-body');
    tbody.innerHTML = '';
    
    currentCap.forEach(item => {
        const itemCurrency = item.moneda || 'ARS';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.tipo_activo || '-'}</strong></td>
            <td>${item.fecha_constitucion ? item.fecha_constitucion.split('-').reverse().join('/') : '-'}</td>
            <td>${item.fecha_vencimiento ? item.fecha_vencimiento.split('-').reverse().join('/') : '-'}</td>
            <td>${formatCurrency(item.capital, itemCurrency)}</td>
            <td><span style="color: var(--copa-success)">+${formatCurrency(item.interes, itemCurrency)}</span></td>
            <td><strong>${formatCurrency(item.monto_final, itemCurrency)}</strong></td>
            <td>${item.tna ? item.tna + '%' : '-'}</td>
            <td>${item.plazo || '-'}</td>
            <td>${item.entidad || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
    if (currentCap.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--copa-text-light);">No hay registros en este mes.</td></tr>';
    }
}

// ----------------------------------------------------
// SECCIÓN 5: ANÁLISIS HISTÓRICO ANUAL
// ----------------------------------------------------
function updateHistoricalSection() {
    if (!selectYearHistorical) return;
    const selectedYear = selectYearHistorical.value;
    if (!rawData || !selectedYear) return;

    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const balanceOpData = [];
    const backgroundColors = [];
    const expedientesData = [];

    months.forEach(m => {
        const ym = `${selectedYear}-${m}`;
        
        // Base de datos (Ingresos vs Egresos Operativos)
        const currentBD = (rawData.base_de_datos || []).filter(item => item.periodo && item.periodo.startsWith(ym));
        let ingOp = 0;
        let egOp = 0;
        currentBD.forEach(item => {
            if (item.subtipo === 'Operativo') {
                if (item.tipo === 'Ingreso') ingOp += item.monto || 0;
                else if (item.tipo === 'Egreso') egOp += item.monto || 0;
            }
        });
        const balanceOp = ingOp - egOp;
        balanceOpData.push(balanceOp);
        backgroundColors.push(balanceOp >= 0 ? '#2E7D32' : '#D32F2F');

        // Expedientes
        const currentExp = (rawData.expedientes || []).filter(item => item.fecha && item.fecha.startsWith(ym));
        let totalExp = 0;
        currentExp.forEach(item => {
            totalExp += item.total || 0;
        });
        expedientesData.push(totalExp);
    });

    // --- GRÁFICO: Balance Operativo Histórico ---
    const canvasRendimiento = document.getElementById('chart-historico-rendimiento');
    if (canvasRendimiento) {
        const ctxRend = canvasRendimiento.getContext('2d');
        if (charts.historicoRendimiento) charts.historicoRendimiento.destroy();
        
        charts.historicoRendimiento = new Chart(ctxRend, {
            type: 'bar',
            data: {
                labels: monthNames,
                datasets: [{
                    label: 'Resultado Operativo ($)',
                    data: balanceOpData,
                    backgroundColor: backgroundColors,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Resultado: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: { color: '#F0F0F0' },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString('es-AR');
                            }
                        }
                    }
                }
            }
        });
    }

    // --- GRÁFICO: Expedientes Histórico ---
    const canvasExp = document.getElementById('chart-historico-expedientes');
    if (canvasExp) {
        const ctxExp = canvasExp.getContext('2d');
        if (charts.historicoExpedientes) charts.historicoExpedientes.destroy();

        charts.historicoExpedientes = new Chart(ctxExp, {
            type: 'bar',
            data: {
                labels: monthNames,
                datasets: [{
                    label: 'Total Expedientes',
                    data: expedientesData,
                    backgroundColor: '#D32F2F',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: '#F0F0F0' }, min: 0 }
                }
            }
        });
    }
}

// ----------------------------------------------------
// HELPERS DELTA RENDER (VARIACIÓN INTERMENSUAL)
// ----------------------------------------------------
function renderDelta(elementId, current, previous, positiveIsGood = true) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (!previous || previous === 0) {
        el.className = 'kpi-delta neutral';
        el.innerHTML = '<span class="delta-pct">N/D</span> vs mes anterior';
        return;
    }
    
    const diff = current - previous;
    const pct = (diff / Math.abs(previous)) * 100;
    
    let isGood = positiveIsGood ? (diff >= 0) : (diff <= 0);
    
    if (diff === 0) {
        el.className = 'kpi-delta neutral';
        el.innerHTML = '<span class="delta-pct">0.0%</span> vs mes anterior';
    } else {
        const arrow = diff > 0 ? '↑' : '↓';
        const sign = diff > 0 ? '+' : '';
        const goodClass = isGood ? 'positive' : 'negative';
        
        el.className = `kpi-delta ${goodClass}`;
        el.innerHTML = `<span class="delta-arrow">${arrow}</span> <span class="delta-pct">${sign}${pct.toFixed(1)}%</span> vs mes anterior`;
    }
}
