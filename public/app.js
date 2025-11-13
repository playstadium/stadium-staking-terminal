        // Configuration
        const CONFIG = {
            STADIUM_APPCHAIN_ID: 574014,
            CONTRACT_ADDRESS: '0xF9637B60f27AF139FC46EAa655cFBbe4E731BCdF',
            REFRESH_INTERVAL: 5 * 60 * 1000,
            API_ENDPOINT: '/api/stats'
        };

        const CHART_PALETTE = {
            primary: '#7FEAC3',
            secondary: '#76F6FF',
            tertiary: '#F9D66B',
            accent: '#FFFFFF',
            muted: 'rgba(255,255,255,0.08)'
        };

        const METRIC_DETAILS = {
            totalStaked: {
                title: 'Total Staked',
                description: 'Sum of SYND currently bonded to Stadium validators. Shows network security and progress toward campaign unlock goals.'
            },
            activeNodes: {
                title: 'Active Nodes',
                description: 'Validators with active SYND stake backing Stadium right now. More nodes means higher resilience and decentralization.'
            },
            avgPerNode: {
                title: 'Average Stake per Node',
                description: 'Average SYND staked across the active validator set. Highlights how concentrated or evenly distributed stake is.'
            },
            networkShare: {
                title: 'Network Share',
                description: "Stadium's share of total SYND staked across all appchains in the ecosystem. Tracks competitive position and influence."
            },
            rank: {
                title: 'Ecosystem Rank',
                description: 'Leaderboard position among appchains by total bonded SYND. Helps plan how additional stake can move Stadium up the rankings.'
            },
            emissionEpoch: {
                title: 'Emission per Epoch',
                description: 'Projected SYND rewards earned by the Stadium validator set for each epoch (~30 days). Feeds treasury, tournaments, and validator payouts.'
            },
            emissionDay: {
                title: 'Emission per Day',
                description: 'Daily equivalent of the epoch emission. Useful for gauging ongoing incentive run-rate and budgeting in real time.'
            }
        };

        if (window.Chart) {
            Chart.defaults.font.family = 'Geist Mono, SFMono-Regular, Menlo, monospace';
            Chart.defaults.color = '#B0B8C0';
            Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
            Chart.defaults.plugins.legend.display = false;
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 20, 25, 0.92)';
            Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
            Chart.defaults.plugins.tooltip.borderWidth = 1;
            Chart.defaults.plugins.tooltip.padding = 10;
        }

        const donutCenterText = {
            id: 'donutCenterText',
            afterDraw(chart, args, opts) {
                if (!opts || !opts.text) return;
                const { ctx } = chart;
                const { width } = chart;
                const height = chart.chartArea.bottom - chart.chartArea.top;
                ctx.save();
                ctx.font = `${opts.fontSize || 18}px Geist Mono, monospace`;
                ctx.fillStyle = opts.color || '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(opts.text, width / 2, chart.chartArea.top + height / 2 - (opts.offsetY || 0));
                if (opts.subtext) {
                    ctx.font = `${opts.subFontSize || 11}px Geist Mono, monospace`;
                    ctx.fillStyle = opts.subColor || '#6B7580';
                    ctx.fillText(opts.subtext, width / 2, chart.chartArea.top + height / 2 + (opts.subOffsetY || 18));
                }
                ctx.restore();
            }
        };

        if (window.Chart) {
            Chart.register(donutCenterText);
        }

        let refreshTimer;
        let currentStats = null;
        let charts = {};
        let allStakersData = [];
        let nodeMarkers = [];
        let hoveredMarker = null;
        let baselineMetrics = null;
        let metricModalState = {
            current: null,
            charts: {}
        };
        let metricTooltipEl = null;
        let metricTooltipTitleEl = null;
        let metricTooltipBodyEl = null;
        let metricBottomSheetEl = null;
        let metricBottomSheetOverlayEl = null;
        let metricBottomSheetTitleEl = null;
        let metricBottomSheetBodyEl = null;
        let metricBottomSheetCloseEl = null;
        let nodeHistoryChart = null;
        let activeTooltipKey = null;
        let metricTooltipEventsBound = false;
        let metricInfoLastTrigger = null;
        const hoverMedia = window.matchMedia('(hover: hover)');
        let supportsHover = hoverMedia.matches;

        function updateHoverCapability(event) {
            supportsHover = event.matches;
            if (supportsHover) {
                hideMetricBottomSheet(true);
            } else {
                hideMetricTooltip(true);
            }
        }

        if (typeof hoverMedia.addEventListener === 'function') {
            hoverMedia.addEventListener('change', updateHoverCapability);
        } else if (typeof hoverMedia.addListener === 'function') {
            hoverMedia.addListener(updateHoverCapability);
        }

        const EMISSION_ALLOCATIONS = [
            { key: 'treasury', label: 'Stadium Treasury', percent: 0.25 },
            { key: 'tournaments', label: 'Tournament Funding', percent: 0.45 },
            { key: 'developer', label: 'Developer Incentives', percent: 0.25 },
            { key: 'gas', label: 'Gas Subsidies', percent: 0.05 }
        ];

        const TOURNAMENT_TIERS = [
            { key: 'casual', label: 'Casual', min: 100, max: 500 },
            { key: 'amateur', label: 'Amateur', min: 500, max: 3000 },
            { key: 'semiPro', label: 'Semi-Pro', min: 3000, max: 10000 },
            { key: 'pro', label: 'Pro', min: 10000, max: 20000 }
        ];

        const EMISSION_SCENARIO_DEFAULTS = {
            additionalStake: 0,
            transactionsPerDay: 220,
            feePerTransactionUSD: 0.5,
            networkFeesPerDayUSD: 10000
        };

        // Chart.js theme customization for minimal sci-fi aesthetic
        let donutCenterPlugin = null;

        if (window.Chart) {
            Chart.defaults.color = 'rgba(176, 184, 192, 0.85)';
            Chart.defaults.font.family = '"Geist Mono", "SF Mono", "Monaco", monospace';
            Chart.defaults.font.size = 11;
            Chart.defaults.plugins.legend.display = false;
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 20, 25, 0.92)';
            Chart.defaults.plugins.tooltip.borderWidth = 0;
            Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
            Chart.defaults.plugins.tooltip.bodyColor = 'rgba(176, 184, 192, 0.9)';
            Chart.defaults.elements.point.radius = 0;
            Chart.defaults.elements.line.borderWidth = 2;
            Chart.defaults.elements.arc.borderWidth = 1.5;

            donutCenterPlugin = {
                id: 'donutCenter',
                afterDraw(chart, args, pluginOptions) {
                    const opts = pluginOptions || chart.options.plugins.donutCenter;
                    if (!opts || !opts.value) return;
                    const meta = chart.getDatasetMeta(0);
                    if (!meta || !meta.data || !meta.data.length) return;
                    const { x, y } = meta.data[0];
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.fillStyle = 'rgba(118, 246, 255, 0.95)';
                    ctx.font = '600 18px "Geist Mono", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(opts.value, x, y - 6);
                    ctx.fillStyle = 'rgba(176, 184, 192, 0.6)';
                    ctx.font = '10px "Geist Mono", monospace';
                    ctx.fillText(opts.label || '', x, y + 10);
                    ctx.restore();
                }
            };

            Chart.register(donutCenterPlugin);
        }

        // Update timestamp
        function updateTimestamp() {
            const now = new Date();
            document.getElementById('timestamp').textContent = 
                now.toLocaleTimeString('en-US', { hour12: false }) + ' local';
        }
        setInterval(updateTimestamp, 1000);
        updateTimestamp();

        function formatNumber(num) {
            if (num === 0) return '0';
            if (num >= 1000000) {
                return (num / 1000000).toFixed(2) + 'M';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
            return num.toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            });
        }

        function formatUSD(value) {
            const numeric = Number.isFinite(value) ? value : 0;
            const sign = numeric < 0 ? '-' : '';
            const abs = Math.abs(numeric);
            let formatted;
            if (abs >= 1000000) {
                formatted = `${(abs / 1000000).toFixed(2)}M`;
            } else if (abs >= 1000) {
                formatted = `${(abs / 1000).toFixed(1)}K`;
            } else {
                formatted = abs.toFixed(0);
            }
            return `${sign}$${formatted}`;
        }

        function formatAddress(address) {
            if (!address) return 'UNKNOWN';
            return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
        }

        function computeBaselineMetrics(stats) {
            const trends = stats.trends || {};
            const dates = Object.keys(trends).sort();
            if (dates.length < 2) {
                return null;
            }

            const baselineDate = dates[dates.length - 2];
            const baseline = trends[baselineDate];
            if (!baseline) return null;

            const totalStaked = typeof baseline.totalStaked === 'number' ? baseline.totalStaked : null;
            const totalStakers = typeof baseline.totalStakers === 'number' ? baseline.totalStakers : null;
            const avgPerNode = totalStakers && totalStakers > 0 && totalStaked !== null
                ? totalStaked / totalStakers
                : null;

            return {
                date: baselineDate,
                totalStaked,
                totalStakers,
                avgPerNode
            };
        }

        function formatBaselineLabel(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            if (Number.isNaN(date.getTime())) {
                return `vs ${dateString}`;
            }
            return `vs ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }

        function setTrend(element, currentValue, previousValue, options = {}) {
            if (!element) return;

            const {
                betterDirection = 'up',
                format = 'percent',
                unit = '',
                decimals = format === 'percent' ? 1 : 0,
                threshold,
                referenceLabel
            } = options;

            element.className = 'metric-trend';
            element.textContent = '—';
            element.title = '';

            if (typeof previousValue !== 'number' || isNaN(previousValue)) {
                return;
            }

            if (currentValue === previousValue) {
                return;
            }

            let changeValue;

            if (format === 'percent') {
                if (Math.abs(previousValue) < 1e-6) {
                    if (Math.abs(currentValue) < 1e-6) {
                        return;
                    }

                    const improved = betterDirection === 'up'
                        ? currentValue > previousValue
                        : betterDirection === 'down'
                            ? currentValue < previousValue
                            : currentValue > previousValue;

                    const arrow = improved ? '▲' : '▼';
                    element.className = `metric-trend ${improved ? 'trend-up' : 'trend-down'}`;
                    element.textContent = `${arrow} NEW${referenceLabel ? ` ${referenceLabel}` : ''}`;
                    element.title = `Previous: ${previousValue}, Current: ${currentValue}${referenceLabel ? ` (${referenceLabel})` : ''}`;
                    return;
                }

                changeValue = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
            } else {
                changeValue = currentValue - previousValue;
            }

            const epsilon = threshold !== undefined ? threshold : (format === 'percent' ? 0.05 : 0.001);
            if (Math.abs(changeValue) < epsilon) {
                return;
            }

            const improved = betterDirection === 'up'
                ? currentValue > previousValue
                : betterDirection === 'down'
                    ? currentValue < previousValue
                    : changeValue > 0;

            const arrow = improved ? '▲' : '▼';
            const absChange = Math.abs(changeValue);
            let text;

            if (format === 'percent') {
                text = `${absChange.toFixed(decimals)}%`;
            } else {
                text = `${absChange.toFixed(decimals)}${unit}`;
            }

            element.className = `metric-trend ${improved ? 'trend-up' : 'trend-down'}`;
            element.textContent = `${arrow} ${text}${referenceLabel ? ` ${referenceLabel}` : ''}`;
            element.title = `Previous: ${previousValue}, Current: ${currentValue}${referenceLabel ? ` (${referenceLabel})` : ''}`;
        }

        function openMetricModal(type) {
            if (!currentStats) return;

            metricModalState.current = type;
            const titleMap = {
                activeNodes: 'Active Nodes Overview',
                avgPerNode: 'Average Stake per Node',
                networkShare: 'Network Share Distribution',
                rank: 'Ecosystem Rank & Scenario',
                emissions: 'Emission Allocation & Projections'
            };

            document.getElementById('metricModalTitle').textContent = titleMap[type] || 'Metric Details';
            const body = document.getElementById('metricModalBody');
            body.innerHTML = buildMetricModalContent(type);

            initializeMetricModal(type);

            document.getElementById('metricModal').classList.add('visible');
        }

        function closeMetricModal(event) {
            if (event && event.target && !event.target.classList.contains('modal-close') && event.target.id !== 'metricModal') {
                return;
            }

            document.getElementById('metricModal').classList.remove('visible');
            destroyMetricModalCharts();
            metricModalState.current = null;
        }

        function buildMetricModalContent(type) {
            switch (type) {
                case 'activeNodes':
                    return `
                        <div class="metric-modal-section">
                            <div class="modal-summary-grid">
                                <div>
                                    <div class="summary-label">Current Active Nodes</div>
                                    <div class="summary-value">${currentStats?.stadium?.totalStakers || 0}</div>
                                    <div class="summary-subtext">${baselineMetrics ? `Baseline: ${baselineMetrics.totalStakers ?? '—'}` : 'Baseline: —'}</div>
                                </div>
                                <div>
                                    <div class="summary-label">Average Stake</div>
                                    <div class="summary-value">${formatNumber(currentStats?.stadium?.totalStaked / (currentStats?.stadium?.totalStakers || 1) || 0)} SYND</div>
                                    <div class="summary-subtext">${baselineMetrics ? `Baseline: ${baselineMetrics.avgPerNode ? formatNumber(baselineMetrics.avgPerNode) + ' SYND' : '—'}` : 'Baseline: —'}</div>
                                </div>
                                <div>
                                    <div class="summary-label">Total Staked</div>
                                    <div class="summary-value">${formatNumber(currentStats?.stadium?.totalStaked || 0)} SYND</div>
                                    <div class="summary-subtext">${baselineMetrics ? `Baseline: ${baselineMetrics.totalStaked ? formatNumber(baselineMetrics.totalStaked) + ' SYND' : '—'}` : 'Baseline: —'}</div>
                                </div>
                            </div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Staker Growth</div>
                            <div class="chart-container"><canvas id="activeNodesTrendChart"></canvas></div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Top Staker Distribution</div>
                            <div id="topStakerDistribution"></div>
                        </div>
                    `;
                case 'avgPerNode':
                    return `
                        <div class="metric-modal-section">
                            <div class="modal-summary-grid">
                                <div>
                                    <div class="summary-label">Average Stake per Node</div>
                                    <div class="summary-value">${formatNumber(currentStats?.stadium?.totalStaked / (currentStats?.stadium?.totalStakers || 1) || 0)} SYND</div>
                                </div>
                                <div>
                                    <div class="summary-label">Median of Top 10</div>
                                    <div class="summary-value">${formatNumber(computeMedianTopStakers(10))} SYND</div>
                                </div>
                                <div>
                                    <div class="summary-label">90th Percentile</div>
                                    <div class="summary-value">${formatNumber(computePercentileStake(0.9))} SYND</div>
                                </div>
                            </div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Average Stake Trend</div>
                            <div class="chart-container"><canvas id="avgPerNodeTrendChart"></canvas></div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Stake Cohorts</div>
                            <div id="stakeCohortTable"></div>
                        </div>
                    `;
                case 'networkShare':
                    return `
                        <div class="metric-modal-section">
                            <div class="modal-summary-grid">
                                <div>
                                    <div class="summary-label">Current Share</div>
                                    <div class="summary-value">${(currentStats?.stadium?.networkShare || 0).toFixed(2)}%</div>
                                </div>
                                <div>
                                    <div class="summary-label">Total Network</div>
                                    <div class="summary-value">${formatNumber(sumEcosystemTotals())} SYND</div>
                                </div>
                                <div>
                                    <div class="summary-label">Rank</div>
                                    <div class="summary-value">#${currentStats?.stadium?.rank || '-'}</div>
                                </div>
                            </div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Network Distribution</div>
                            <div class="chart-container"><canvas id="networkShareDonut"></canvas></div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Appchain Breakdown</div>
                            <div id="networkShareTable"></div>
                        </div>
                    `;
                case 'rank':
                    return `
                        <div class="metric-modal-section">
                            <div class="modal-summary-grid" id="rankScenarioSummary">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Scenario Simulator</div>
                            <div class="scenario-controls">
                                <label for="rankScenarioSlider">Additional Stake to Stadium (SYND)</label>
                                <input type="range" id="rankScenarioSlider" min="0" max="200000" step="1000" value="0">
                                <div class="scenario-inputs">
                                    <input type="number" id="rankScenarioInput" min="0" max="200000" step="1000" value="0">
                                    <div class="scenario-quick-buttons" id="rankScenarioButtons">
                                        <button type="button" data-scenario="5000">+5K</button>
                                        <button type="button" data-scenario="25000">+25K</button>
                                        <button type="button" data-scenario="50000">+50K</button>
                                        <button type="button" data-scenario="100000">+100K</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Ecosystem Leaderboard</div>
                            <div id="rankTableContainer"></div>
                        </div>
                    `;
                case 'emissions':
                    return `
                        <div class="metric-modal-section">
                            <div class="modal-toggle-row">
                                <span class="modal-toggle-label">Performance Pool</span>
                                <button type="button" class="toggle-switch" id="emissionPerformanceToggle" aria-pressed="false"></button>
                            </div>
                            <div class="disclaimer-note" id="emissionPerformanceDisclaimer" style="display: none;">
                                Performance pool projections are speculative while the network matures and official metrics remain unavailable.
                            </div>
                            <div class="modal-summary-grid" id="emissionSummaryGrid">
                                <!-- Summary populated dynamically -->
                            </div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Allocation Breakdown</div>
                            <div id="emissionAllocationTable"></div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Scenario Simulator</div>
                            <div class="scenario-controls">
                                <label for="emissionScenarioSlider">Additional Stake to Stadium (SYND)</label>
                                <input type="range" id="emissionScenarioSlider" min="0" max="200000" step="1000" value="0">
                                <div class="scenario-inputs">
                                    <input type="number" id="emissionScenarioInput" min="0" max="200000" step="1000" value="0">
                                    <div class="scenario-quick-buttons" id="emissionScenarioButtons">
                                        <button type="button" data-scenario="5000">+5K</button>
                                        <button type="button" data-scenario="25000">+25K</button>
                                        <button type="button" data-scenario="50000">+50K</button>
                                        <button type="button" data-scenario="100000">+100K</button>
                                    </div>
                                </div>
                                <div id="emissionPerformanceInputs" style="display: none;">
                                    <div class="scenario-grid">
                                        <div class="scenario-field">
                                            <label for="emissionTransactionsInput">Estimated Actions per Day</label>
                                            <input type="number" id="emissionTransactionsInput" min="0" step="10" value="220">
                                        </div>
                                        <div class="scenario-field">
                                            <label for="emissionFeeInput">Fee per Action (USD)</label>
                                            <input type="number" id="emissionFeeInput" min="0" step="0.01" value="0.5">
                                        </div>
                                        <div class="scenario-field">
                                            <label for="emissionNetworkFeeInput">Network Fees per Day (USD)</label>
                                            <input type="number" id="emissionNetworkFeeInput" min="0" step="100" value="10000">
                                        </div>
                                    </div>
                                    <div class="scenario-helper">
                                        Performance share approximation uses 40% fee share and 60% stake share. Casual/Amateur events run daily (1v1 Bo1-Bo3). Semi-Pro/Pro events run in 3-day blocks weekly/monthly with 1v1, 3v3, or 5v5 Bo1-Bo5 formats. Daily capacity assumes a soft cap of 5 paid matches per day.
                                    </div>
                                </div>
                                <button type="button" class="scenario-reset-button" id="emissionScenarioReset">Reset Scenario</button>
                            </div>
                        </div>
                        <div class="metric-modal-section">
                            <div class="section-title">Tournament Coverage</div>
                            <div id="tournamentProjectionTable"></div>
                        </div>
                    `;
                default:
                    return '<div style="padding: 40px; text-align: center; color: var(--text-muted);">Metric details unavailable.</div>';
            }
        }

        function initializeMetricModal(type) {
            switch (type) {
                case 'activeNodes':
                    renderActiveNodesModal();
                    break;
                case 'avgPerNode':
                    renderAvgPerNodeModal();
                    break;
                case 'networkShare':
                    renderNetworkShareModal();
                    break;
                case 'rank':
                    renderRankModal();
                    break;
                case 'emissions':
                    renderEmissionsModal();
                    break;
            }
        }

        function refreshMetricModal() {
            if (!metricModalState.current || !document.getElementById('metricModal').classList.contains('visible')) {
                return;
            }

            destroyMetricModalCharts();
            const type = metricModalState.current;
            document.getElementById('metricModalBody').innerHTML = buildMetricModalContent(type);
            initializeMetricModal(type);
        }

        function destroyMetricModalCharts() {
            Object.values(metricModalState.charts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
            metricModalState.charts = {};
        }

        function hexToRgba(hex, alpha = 1) {
            const sanitized = hex.replace('#', '');
            const bigint = parseInt(sanitized, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        function createVerticalGradient(ctx, color) {
            const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
            gradient.addColorStop(0, hexToRgba(color, 0.45));
            gradient.addColorStop(0.7, hexToRgba(color, 0.18));
            gradient.addColorStop(1, hexToRgba(color, 0));
            return gradient;
        }

        function minimalGrid(color) {
            return {
                color,
                drawTicks: false,
                borderDash: [4, 4],
                borderColor: 'rgba(255, 255, 255, 0.08)'
            };
        }

        function ensureMetricTooltip() {
            if (metricTooltipEl) return;

            metricTooltipEl = document.createElement('div');
            metricTooltipEl.className = 'metric-tooltip';
            metricTooltipEl.innerHTML = `
                <div class="metric-tooltip-title"></div>
                <div class="metric-tooltip-body"></div>
            `;

            metricTooltipTitleEl = metricTooltipEl.querySelector('.metric-tooltip-title');
            metricTooltipBodyEl = metricTooltipEl.querySelector('.metric-tooltip-body');

            document.body.appendChild(metricTooltipEl);
        }

        function ensureMetricBottomSheet() {
            if (metricBottomSheetEl) return;

            metricBottomSheetEl = document.getElementById('metricBottomSheet');
            metricBottomSheetOverlayEl = document.getElementById('metricBottomSheetOverlay');
            metricBottomSheetTitleEl = document.getElementById('metricBottomSheetTitle');
            metricBottomSheetBodyEl = document.getElementById('metricBottomSheetBody');
            metricBottomSheetCloseEl = document.getElementById('metricBottomSheetClose');

            if (metricBottomSheetOverlayEl) {
                metricBottomSheetOverlayEl.addEventListener('click', () => hideMetricBottomSheet(true));
            }

            if (metricBottomSheetCloseEl) {
                metricBottomSheetCloseEl.addEventListener('click', () => hideMetricBottomSheet(true));
            }
        }

        function isMetricInfoVisible() {
            const tooltipVisible = metricTooltipEl?.classList.contains('visible');
            const sheetVisible = metricBottomSheetEl?.classList.contains('visible');
            return Boolean(tooltipVisible || sheetVisible);
        }

        function positionMetricTooltip(rect, event) {
            if (!metricTooltipEl || !metricTooltipEl.classList.contains('visible')) return;

            const padding = 12;
            let x = rect ? rect.left + rect.width / 2 : (event ? event.clientX : 0);
            let y = rect ? rect.bottom + 12 : (event ? event.clientY : 0);

            if (event && event.type.startsWith('mouse')) {
                x = event.clientX + 16;
                y = event.clientY + 16;
            }

            const tooltipRect = metricTooltipEl.getBoundingClientRect();
            const maxX = window.innerWidth - tooltipRect.width - padding;
            const maxY = window.innerHeight - tooltipRect.height - padding;

            if (x > maxX) x = maxX;
            if (y > maxY) {
                y = rect ? rect.top - tooltipRect.height - 12 : maxY;
            }

            metricTooltipEl.style.left = `${Math.max(padding, x)}px`;
            metricTooltipEl.style.top = `${Math.max(padding, y)}px`;
        }

        function showMetricTooltip(key, rect, event) {
            const details = METRIC_DETAILS[key];
            if (!details) return;

            activeTooltipKey = key;
            if (!supportsHover) {
                showMetricBottomSheet(details);
                return;
            }

            ensureMetricTooltip();

            metricTooltipTitleEl.textContent = details.title;
            metricTooltipBodyEl.textContent = details.description;

            metricTooltipEl.classList.add('visible');
            positionMetricTooltip(rect, event);
        }

        function hideMetricTooltip(force = false) {
            if (!supportsHover) {
                hideMetricBottomSheet(force);
                return;
            }

            if (!metricTooltipEl) return;
            if (!force && !metricTooltipEl.classList.contains('visible')) return;

            metricTooltipEl.classList.remove('visible');
            activeTooltipKey = null;
            metricInfoLastTrigger = null;
        }

        function showMetricBottomSheet(details) {
            ensureMetricBottomSheet();
            if (!metricBottomSheetEl || !metricBottomSheetTitleEl || !metricBottomSheetBodyEl) return;

            metricBottomSheetTitleEl.textContent = details.title;
            metricBottomSheetBodyEl.textContent = details.description;
            metricBottomSheetEl.classList.add('visible');
            metricBottomSheetEl.setAttribute('aria-hidden', 'false');
            metricBottomSheetEl.focus({ preventScroll: true });
            if (metricBottomSheetOverlayEl) {
                metricBottomSheetOverlayEl.classList.add('visible');
            }
            document.body.classList.add('metric-bottom-sheet-open');
        }

        function hideMetricBottomSheet(force = false) {
            ensureMetricBottomSheet();
            if (!metricBottomSheetEl) return;
            if (!force && !metricBottomSheetEl.classList.contains('visible')) return;

            metricBottomSheetEl.classList.remove('visible');
            metricBottomSheetEl.setAttribute('aria-hidden', 'true');
            if (metricBottomSheetOverlayEl) {
                metricBottomSheetOverlayEl.classList.remove('visible');
            }
            document.body.classList.remove('metric-bottom-sheet-open');
            if (metricInfoLastTrigger && typeof metricInfoLastTrigger.focus === 'function') {
                setTimeout(() => {
                    metricInfoLastTrigger?.focus({ preventScroll: true });
                    metricInfoLastTrigger = null;
                }, 0);
            } else {
                metricInfoLastTrigger = null;
            }
            activeTooltipKey = null;
        }

        function initMetricTooltips() {
            const candidates = Array.from(document.querySelectorAll('[data-tooltip-key]'));
            if (!candidates.length) return;

            ensureMetricTooltip();
            ensureMetricBottomSheet();

            candidates.forEach(element => {
                const key = element.dataset.tooltipKey;
                if (!key || !METRIC_DETAILS[key] || element.dataset.tooltipInitialized === 'true') {
                    return;
                }

                element.dataset.tooltipInitialized = 'true';

                const label = element.querySelector('.metric-card-label, .stat-label');
                if (label) {
                    label.classList.add('metric-label-with-info');

                    let infoButton = label.querySelector('.metric-info-trigger');
                    if (!infoButton) {
                        infoButton = document.createElement('button');
                        infoButton.type = 'button';
                        infoButton.className = 'metric-info-trigger';
                        infoButton.textContent = '?';
                        infoButton.setAttribute('aria-label', `Why we track ${METRIC_DETAILS[key].title}`);
                        infoButton.setAttribute('aria-haspopup', 'true');
                        infoButton.setAttribute('data-tooltip-key', key);
                        label.appendChild(infoButton);
                    }

                    if (infoButton && infoButton.dataset.tooltipBound !== 'true') {
                        const show = event => {
                            if (event?.currentTarget) {
                                metricInfoLastTrigger = event.currentTarget;
                            }
                            showMetricTooltip(key, element.getBoundingClientRect(), event);
                        };
                        const toggleButton = event => {
                            event.stopPropagation();
                            event.preventDefault();
                            if (event?.currentTarget) {
                                metricInfoLastTrigger = event.currentTarget;
                            }
                            if (activeTooltipKey === key && isMetricInfoVisible()) {
                                hideMetricTooltip(true);
                            } else {
                                showMetricTooltip(key, element.getBoundingClientRect(), event);
                            }
                        };

                        infoButton.addEventListener('click', toggleButton);
                        infoButton.addEventListener('touchstart', event => {
                            event.stopPropagation();
                            event.preventDefault();
                            toggleButton(event);
                        }, { passive: false });

                        if (supportsHover) {
                            infoButton.addEventListener('mouseenter', show);
                            infoButton.addEventListener('mousemove', event => {
                                if (activeTooltipKey === key) {
                                    positionMetricTooltip(element.getBoundingClientRect(), event);
                                }
                            });
                        }

                        infoButton.addEventListener('focus', show);
                        infoButton.addEventListener('blur', () => {
                            if (activeTooltipKey === key) hideMetricTooltip();
                        });

                        infoButton.dataset.tooltipBound = 'true';
                    }
                }

            });

            if (!metricTooltipEventsBound) {
                window.addEventListener('resize', () => hideMetricTooltip(true));
                window.addEventListener('scroll', () => hideMetricTooltip(true), true);
                document.addEventListener('pointerdown', event => {
                    if (!isMetricInfoVisible()) return;
                    if (event.target.closest('[data-tooltip-key]')) return;
                    if (event.target.closest('.metric-bottom-sheet')) return;
                    hideMetricTooltip(true);
                });
                document.addEventListener('keydown', event => {
                    if (event.key === 'Escape' && isMetricInfoVisible()) {
                        hideMetricTooltip(true);
                    }
                });
                metricTooltipEventsBound = true;
            }
        }

        document.querySelectorAll('.metric-card.interactive').forEach(card => {
            card.addEventListener('click', () => {
                const metric = card.dataset.metric;
                if (metric) {
                    openMetricModal(metric);
                }
            });
        });

        function destroyNodeHistoryChart() {
            if (nodeHistoryChart && typeof nodeHistoryChart.destroy === 'function') {
                nodeHistoryChart.destroy();
            }
            nodeHistoryChart = null;
        }

        function computeNodeHistorySeries(node) {
            const history = Array.isArray(node?.history) ? node.history.slice(-20) : [];
            if (!history.length) {
                return { labels: [], values: [], baseline: 0, netChange: 0 };
            }

            const sorted = history.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const deltas = sorted.map(entry => {
                const amount = Number(entry.amount) || 0;
                if (entry.type && entry.type.toLowerCase() === 'unstake') {
                    return -amount;
                }
                return amount;
            });

            const netChange = deltas.reduce((sum, value) => sum + value, 0);
            let baseline = Number(node?.amount) - netChange;
            if (!Number.isFinite(baseline) || baseline < 0) {
                baseline = 0;
            }

            const labels = [];
            const values = [];
            let running = baseline;

            labels.push('Baseline');
            values.push(running);

            sorted.forEach((entry, index) => {
                running += deltas[index];
                labels.push(new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                values.push(Math.max(running, 0));
            });

            return { labels, values, baseline, netChange, sorted };
        }

        function renderNodeHistoryTrend(node) {
            destroyNodeHistoryChart();
            const canvas = document.getElementById('nodeHistoryTrendChart');
            if (!canvas) return;

            const { labels, values, baseline, netChange } = computeNodeHistorySeries(node);
            if (!labels.length) {
                const netElement = document.getElementById('nodeHistoryNetChange');
                const contextElement = document.getElementById('nodeHistoryContext');
                if (netElement && contextElement) {
                    netElement.classList.remove('gain', 'loss');
                    netElement.textContent = '0 SYND';
                    contextElement.textContent = 'No recent actions recorded';
                }
                canvas.parentElement.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 30px 0;">Not enough history to chart.</div>';
                return;
            }

            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(127, 234, 195, 0.25)');
            gradient.addColorStop(1, 'rgba(127, 234, 195, 0.02)');

            nodeHistoryChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Total Staked',
                        data: values,
                        borderColor: '#7FEAC3',
                        backgroundColor: gradient,
                        fill: true,
                        borderWidth: 2,
                        tension: 0.35,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: context => `${formatNumber(context.parsed.y)} SYND`
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: false
                        },
                        y: {
                            display: false,
                            beginAtZero: true
                        }
                    }
                }
            });

            const netElement = document.getElementById('nodeHistoryNetChange');
            const contextElement = document.getElementById('nodeHistoryContext');
            if (netElement && contextElement) {
                const finalValue = values[values.length - 1];
                const changeClass = netChange >= 0 ? 'gain' : 'loss';
                const percent = baseline > 0 ? ((finalValue - baseline) / baseline) * 100 : null;
                netElement.classList.remove('gain', 'loss');
                netElement.classList.add(changeClass);
                netElement.textContent = `${netChange >= 0 ? '+' : '-'}${formatNumber(Math.abs(netChange))} SYND`;
                contextElement.textContent = percent !== null
                    ? `~${Math.abs(percent).toFixed(1)}% ${netChange >= 0 ? 'increase' : 'drawdown'} over last ${values.length - 1} actions`
                    : `Change over last ${values.length - 1} actions`;
            }
        }

        function renderNodeHistoryTimeline(node) {
            const container = document.getElementById('nodeHistoryTimeline');
            if (!container) return;

            const history = Array.isArray(node?.history) ? node.history.slice(-20) : [];
            if (!history.length) {
                container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 11px;">No history available for this node.</div>';
                return;
            }

            const sorted = history.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            container.innerHTML = sorted.map(entry => {
                const date = new Date(entry.timestamp);
                const type = (entry.type || '').toLowerCase();
                const isLoss = type === 'unstake';
                const amount = formatNumber(entry.amount || 0);
                const noteParts = [];

                if (entry.txHash) {
                    noteParts.push(`<a href="https://commons.explorer.syndicate.io/tx/${entry.txHash}" target="_blank" style="color: var(--text-muted); text-decoration: none;">View tx →</a>`);
                }

                return `
                    <div class="node-history-entry ${isLoss ? 'loss' : 'gain'}">
                        <div class="event-header">
                            <span class="event-type">${type === 'unstake' ? 'Unstake' : 'Stake'}</span>
                            <span class="event-time">${date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                        <div class="event-amount">${isLoss ? '-' : '+'}${amount} SYND</div>
                        ${noteParts.length ? `<div class="event-note">${noteParts.join(' · ')}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        function computeMedianTopStakers(count = 10) {
            if (!currentStats || !currentStats.top10) return 0;
            const values = currentStats.top10
                .slice(0, count)
                .map(item => item.amount || 0)
                .sort((a, b) => a - b);
            if (values.length === 0) return 0;
            const mid = Math.floor(values.length / 2);
            if (values.length % 2 === 0) {
                return (values[mid - 1] + values[mid]) / 2;
            }
            return values[mid];
        }

        function computePercentileStake(percent = 0.9) {
            if (!allStakersData || allStakersData.length === 0) return 0;
            const sorted = [...allStakersData]
                .map(item => item.amount || 0)
                .sort((a, b) => a - b);
            const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(percent * (sorted.length - 1))));
            return sorted[index];
        }

        function sumEcosystemTotals() {
            if (!currentStats || !currentStats.ecosystem) return 0;
            return currentStats.ecosystem.reduce((sum, item) => sum + (item.total || 0), 0);
        }

        function renderActiveNodesModal() {
            renderActiveNodesTrendChart();
            renderTopStakerDistribution();
        }

        function renderActiveNodesTrendChart() {
            const ctx = document.getElementById('activeNodesTrendChart')?.getContext('2d');
            if (!ctx || !currentStats?.trends) return;

            const dates = Object.keys(currentStats.trends).sort();
            const stakerSeries = dates.map(date => currentStats.trends[date].totalStakers || 0);
            const stakeSeries = dates.map(date => currentStats.trends[date].totalStaked || 0);

            metricModalState.charts.activeNodesTrend = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: 'Active Nodes',
                            data: stakerSeries,
                            borderColor: '#4CE6B6',
                            backgroundColor: createVerticalGradient(ctx, '#4CE6B6'),
                            fill: true,
                            tension: 0.35,
                            yAxisID: 'y1'
                        },
                        {
                            label: 'Total Staked (SYND)',
                            data: stakeSeries,
                            borderColor: '#40C5FF',
                            backgroundColor: createVerticalGradient(ctx, '#40C5FF'),
                            fill: true,
                            tension: 0.35,
                            yAxisID: 'y2'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    scales: {
                        y1: {
                            position: 'left',
                            ticks: {
                                color: 'rgba(127, 234, 195, 0.85)',
                                padding: 8
                            },
                            grid: minimalGrid('rgba(127, 234, 195, 0.08)'),
                            border: { display: false }
                        },
                        y2: {
                            position: 'right',
                            ticks: {
                                color: 'rgba(64, 197, 255, 0.85)',
                                padding: 8
                            },
                            grid: { drawOnChartArea: false },
                            border: { display: false }
                        },
                        x: {
                            ticks: {
                                color: 'rgba(107, 117, 128, 0.8)',
                                callback: (value, index) => {
                                    const date = dates[index];
                                    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                },
                                maxTicksLimit: 6,
                                autoSkip: true
                            },
                            grid: {
                                drawBorder: false,
                                display: false
                            }
                        }
                    }
                }
            });
        }

        function renderTopStakerDistribution() {
            const container = document.getElementById('topStakerDistribution');
            if (!container || !currentStats?.top10) return;

            const rows = currentStats.top10.map(staker => `
                <tr>
                    <td>#${staker.rank}</td>
                    <td>${formatAddress(staker.address)}</td>
                    <td>${formatNumber(staker.amount)} SYND</td>
                    <td>${staker.percentage.toFixed(2)}%</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Node</th>
                            <th>Stake</th>
                            <th>Share</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        function renderAvgPerNodeModal() {
            renderAvgPerNodeTrendChart();
            renderStakeCohortTable();
        }

        function renderAvgPerNodeTrendChart() {
            const ctx = document.getElementById('avgPerNodeTrendChart')?.getContext('2d');
            if (!ctx || !currentStats?.trends) return;

            const dates = Object.keys(currentStats.trends).sort();
            const avgSeries = dates.map(date => {
                const entry = currentStats.trends[date];
                if (!entry || entry.totalStakers === 0) return 0;
                return entry.totalStaked / entry.totalStakers;
            });
            const stakeSeries = dates.map(date => currentStats.trends[date].totalStaked || 0);

            metricModalState.charts.avgPerNodeTrend = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: 'Average Stake per Node (SYND)',
                            data: avgSeries,
                            borderColor: '#FDFEFF',
                            backgroundColor: createVerticalGradient(ctx, '#FDFEFF'),
                            fill: true,
                            tension: 0.35,
                            yAxisID: 'y1'
                        },
                        {
                            label: 'Total Staked (SYND)',
                            data: stakeSeries,
                            borderColor: '#4CE6B6',
                            backgroundColor: createVerticalGradient(ctx, '#4CE6B6'),
                            fill: true,
                            tension: 0.35,
                            yAxisID: 'y2'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    scales: {
                        y1: {
                            position: 'left',
                            ticks: {
                                color: 'rgba(253, 254, 255, 0.85)',
                                padding: 8
                            },
                            grid: minimalGrid('rgba(253, 254, 255, 0.08)'),
                            border: { display: false }
                        },
                        y2: {
                            position: 'right',
                            ticks: {
                                color: 'rgba(76, 230, 182, 0.85)',
                                padding: 8
                            },
                            grid: { drawOnChartArea: false },
                            border: { display: false }
                        },
                        x: {
                            ticks: {
                                color: 'rgba(107, 117, 128, 0.8)',
                                callback: (value, index) => {
                                    const date = dates[index];
                                    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                },
                                maxTicksLimit: 6,
                                autoSkip: true
                            },
                            grid: {
                                drawBorder: false,
                                display: false
                            }
                        }
                    }
                }
            });
        }

        function renderStakeCohortTable() {
            const container = document.getElementById('stakeCohortTable');
            if (!container || !allStakersData || allStakersData.length === 0) {
                if (container) {
                    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No staker data available.</div>';
                }
                return;
            }

            const cohorts = [
                { label: '< 1K SYND', min: 0, max: 1000 },
                { label: '1K - 10K SYND', min: 1000, max: 10000 },
                { label: '10K - 50K SYND', min: 10000, max: 50000 },
                { label: '50K+ SYND', min: 50000, max: Infinity }
            ];

            const rows = cohorts.map(cohort => {
                const members = allStakersData.filter(staker => {
                    const amount = staker.amount || 0;
                    return amount >= cohort.min && amount < cohort.max;
                });
                const totalStake = members.reduce((sum, staker) => sum + (staker.amount || 0), 0);
                const avgStake = members.length ? totalStake / members.length : 0;
                return `
                    <tr>
                        <td>${cohort.label}</td>
                        <td>${members.length}</td>
                        <td>${formatNumber(totalStake)} SYND</td>
                        <td>${members.length ? formatNumber(avgStake) + ' SYND' : '—'}</td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Cohort</th>
                            <th>Nodes</th>
                            <th>Total Stake</th>
                            <th>Average Stake</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        function renderNetworkShareModal() {
            renderNetworkShareDonut();
            renderNetworkShareTable();
        }

        function simulateNetworkWithAdditionalStake(additionalStake = 0) {
            if (!currentStats || !currentStats.ecosystem) return null;

            const stadiumId = CONFIG.STADIUM_APPCHAIN_ID;
            const updated = currentStats.ecosystem.map(item => ({
                ...item,
                total: item.total + (item.appchainId === stadiumId ? additionalStake : 0)
            }));

            const totalNetwork = updated.reduce((sum, item) => sum + (item.total || 0), 0);
            updated.sort((a, b) => b.total - a.total);
            updated.forEach((item, index) => {
                item.rank = index + 1;
                item.share = totalNetwork > 0 ? (item.total / totalNetwork) * 100 : 0;
            });

            const stadium = updated.find(item => item.appchainId === stadiumId);
            const nextHigher = updated.filter(item => item.rank < (stadium ? stadium.rank : Infinity)).slice(-1)[0];

            return { ecosystem: updated, stadium, totalNetwork, nextHigher };
        }

        function renderNetworkShareDonut() {
            const ctx = document.getElementById('networkShareDonut')?.getContext('2d');
            if (!ctx || !currentStats?.ecosystem) return;

            const sorted = [...currentStats.ecosystem]
                .sort((a, b) => b.total - a.total)
                .sort((a, b) => (a.appchainId === CONFIG.STADIUM_APPCHAIN_ID ? -1 : 0) - (b.appchainId === CONFIG.STADIUM_APPCHAIN_ID ? -1 : 0));
            const top = sorted.slice(0, 5);
            const others = sorted.slice(5);
            const otherTotal = others.reduce((sum, item) => sum + (item.total || 0), 0);

            const labels = top.map(item => formatAppchainLabel(item.appchainId));
            const data = top.map(item => item.total || 0);
            if (otherTotal > 0) {
                labels.push('Other Appchains');
                data.push(otherTotal);
            }

            const colors = labels.map(label => {
                if (label === 'Stadium') return '#40C5FF';
                return 'rgba(22, 32, 40, 0.85)';
            });
            // Slight variation for additional slices
            for (let i = 0; i < colors.length; i++) {
                if (colors[i] !== '#40C5FF') {
                    const alpha = 0.55 + (i * 0.08);
                    colors[i] = `rgba(24, 36, 44, ${Math.min(alpha, 0.85)})`;
                }
            }

            const stadiumEntry = currentStats.ecosystem.find(item => item.appchainId === CONFIG.STADIUM_APPCHAIN_ID);
            const stadiumShare = stadiumEntry ? stadiumEntry.share || 0 : 0;

            metricModalState.charts.networkShareDonut = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors,
                        borderColor: '#0C1116',
                        borderWidth: 1.5,
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    cutout: '70%',
                    rotation: -90,
                    plugins: {
                        donutCenter: {
                            value: `${stadiumShare.toFixed(1)}%`,
                            label: 'Stadium Share'
                        }
                    }
                },
                plugins: donutCenterPlugin ? [donutCenterPlugin] : []
            });
        }

        function renderNetworkShareTable(additionalStake = 0) {
            const container = document.getElementById('networkShareTable');
            if (!container || !currentStats?.ecosystem) return;

            const rows = currentStats.ecosystem.map(item => `
                <tr ${item.appchainId === CONFIG.STADIUM_APPCHAIN_ID ? 'class="highlight"' : ''}>
                    <td>#${item.rank}</td>
                    <td>${formatAppchainLabel(item.appchainId)}</td>
                    <td>${formatNumber(item.total)} SYND</td>
                    <td>${(item.share || 0).toFixed(2)}%</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Appchain</th>
                            <th>Total Staked</th>
                            <th>Share</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        function renderRankModal() {
            setupRankScenarioControls();
            updateRankScenario(0);
        }

        function renderEmissionsModal() {
            initializeEmissionModal();
        }

        function computeEmissionScenario(additionalStake = 0, options = {}) {
            const simulation = simulateNetworkWithAdditionalStake(additionalStake);
            const share = simulation?.stadium?.share ?? (currentStats?.stadium?.networkShare || 0);
            const baselineShare = currentStats?.stadium?.networkShare || 0;
            const appchainPoolEmission = currentStats?.emissions?.appchainPoolEmissionPerEpoch || 0;
            const performancePoolEmission = currentStats?.emissions?.performancePoolEmissionPerEpoch || 0;
            const epochDays = currentStats?.emissions?.epochDurationDays || 30;
            const price = currentStats?.price?.price || 0;
            const baselinePerformanceShare = (currentStats?.emissions?.stadiumPerformanceShare ?? (baselineShare / 100)) || 0;

            const transactionsPerDay = Number.isFinite(options.transactionsPerDay) ? options.transactionsPerDay : 0;
            const feePerTransactionUSD = Number.isFinite(options.feePerTransactionUSD) ? options.feePerTransactionUSD : 0;
            const networkFeesPerDayUSD = Number.isFinite(options.networkFeesPerDayUSD) ? options.networkFeesPerDayUSD : 0;

            const stadiumFeesPerDayUSD = transactionsPerDay * feePerTransactionUSD;
            const stadiumFeesPerEpochUSD = stadiumFeesPerDayUSD * epochDays;
            const totalNetworkFeesPerDayUSD = Math.max(stadiumFeesPerDayUSD, networkFeesPerDayUSD);
            const totalNetworkFeesPerEpochUSD = totalNetworkFeesPerDayUSD * epochDays;
            const feeShare = totalNetworkFeesPerEpochUSD > 0 ? stadiumFeesPerEpochUSD / totalNetworkFeesPerEpochUSD : 0;

            // Approximate performance share blending fee share (40%) with stake share (60%)
            const stakeShareDecimal = share / 100;
            const performanceShareDecimal = Math.max(0, Math.min(1, (feeShare * 0.4) + (stakeShareDecimal * 0.6)));

            const emissionPerEpochSYND = appchainPoolEmission * (share / 100);
            const emissionPerDaySYND = emissionPerEpochSYND / epochDays;
            const emissionPerEpochUSD = emissionPerEpochSYND * price;
            const emissionPerDayUSD = emissionPerDaySYND * price;

            const baselineEmissionPerEpoch = currentStats?.emissions?.stadiumEmissionPerEpoch || (appchainPoolEmission * (baselineShare / 100));

            const performancePerEpochSYND = performancePoolEmission * performanceShareDecimal;
            const performancePerDaySYND = performancePerEpochSYND / epochDays;
            const performancePerEpochUSD = performancePerEpochSYND * price;
            const performancePerDayUSD = performancePerDaySYND * price;
            const baselinePerformancePerEpochSYND = currentStats?.emissions?.stadiumPerformancePerEpoch || (performancePoolEmission * baselinePerformanceShare);
            const baselinePerformancePerEpochUSD = baselinePerformancePerEpochSYND * price;

            return {
                share,
                baselineShare,
                emissionPerEpochSYND,
                emissionPerDaySYND,
                emissionPerEpochUSD,
                emissionPerDayUSD,
                baselineEmissionPerEpoch,
                epochDays,
                price,
                simulation,
                performancePerEpochSYND,
                performancePerDaySYND,
                performancePerEpochUSD,
                performancePerDayUSD,
                baselinePerformancePerEpochSYND,
                baselinePerformancePerEpochUSD,
                performanceShare: performanceShareDecimal * 100,
                feeShare: feeShare * 100,
                stadiumFeesPerEpochUSD,
                stadiumFeesPerDayUSD,
                totalNetworkFeesPerEpochUSD
            };
        }

        function formatAppchainLabel(appchainId) {
            const labels = {
                574014: 'Stadium',
                510003: 'Commons',
                63829: 'Fabric',
                510525: 'Prime'
            };
            return labels[appchainId] || `Appchain ${appchainId}`;
        }

        function setupRankScenarioControls() {
            const slider = document.getElementById('rankScenarioSlider');
            const input = document.getElementById('rankScenarioInput');
            const buttons = document.querySelectorAll('#rankScenarioButtons button');

            if (!slider || !input) return;

            const syncValue = value => {
                const normalized = Math.max(parseInt(slider.min, 10), Math.min(parseInt(slider.max, 10), Math.round(value / parseInt(slider.step, 10)) * parseInt(slider.step, 10)));
                slider.value = normalized;
                input.value = normalized;
                updateRankScenario(normalized);
            };

            slider.oninput = () => syncValue(parseInt(slider.value, 10));
            input.oninput = () => syncValue(parseInt(input.value, 10) || 0);

            buttons.forEach(button => {
                button.addEventListener('click', () => {
                    const increment = parseInt(button.dataset.scenario, 10) || 0;
                    const current = parseInt(slider.value, 10) || 0;
                    syncValue(current + increment);
                });
            });
        }

        function setupEmissionScenarioControls() {
            const slider = document.getElementById('emissionScenarioSlider');
            const input = document.getElementById('emissionScenarioInput');
            const buttons = document.querySelectorAll('#emissionScenarioButtons button');
            const transactionsInput = document.getElementById('emissionTransactionsInput');
            const feeInput = document.getElementById('emissionFeeInput');
            const networkFeeInput = document.getElementById('emissionNetworkFeeInput');

            if (!slider || !input) return;

            const syncValue = value => {
                const normalized = Math.max(parseInt(slider.min, 10), Math.min(parseInt(slider.max, 10), Math.round((value || 0) / parseInt(slider.step, 10)) * parseInt(slider.step, 10)));
                slider.value = normalized;
                input.value = normalized;
                updateEmissionScenario(normalized);
            };

            slider.oninput = () => syncValue(parseInt(slider.value, 10));
            input.oninput = () => syncValue(parseInt(input.value, 10) || 0);

            buttons.forEach(button => {
                button.addEventListener('click', () => {
                    const increment = parseInt(button.dataset.scenario, 10) || 0;
                    const current = parseInt(slider.value, 10) || 0;
                    syncValue(current + increment);
                });
            });

            const emitChange = () => syncValue(parseInt(slider.value, 10) || 0);

            if (transactionsInput) {
                transactionsInput.addEventListener('input', emitChange);
            }
            if (feeInput) {
                feeInput.addEventListener('input', emitChange);
            }
            if (networkFeeInput) {
                networkFeeInput.addEventListener('input', emitChange);
            }

            return syncValue;
        }

        function updateEmissionScenario(additionalStake = 0) {
            const transactionsInput = document.getElementById('emissionTransactionsInput');
            const feeInput = document.getElementById('emissionFeeInput');
            const networkFeeInput = document.getElementById('emissionNetworkFeeInput');

            const transactionsPerDay = parseFloat(transactionsInput?.value || '0') || 0;
            const feePerTransactionUSD = parseFloat(feeInput?.value || '0.5') || 0;
            const networkFeesPerDayUSD = parseFloat(networkFeeInput?.value || '0') || 0;

            const scenario = computeEmissionScenario(additionalStake, {
                transactionsPerDay,
                feePerTransactionUSD,
                networkFeesPerDayUSD
            });
            if (!scenario) return;

            const baselineEmissionPerEpochSYND = currentStats?.emissions?.stadiumEmissionPerEpoch || scenario.baselineEmissionPerEpoch;
            const baselineEmissionPerEpochUSD = baselineEmissionPerEpochSYND * (scenario.price || 0);
            const emissionDeltaSYND = scenario.emissionPerEpochSYND - baselineEmissionPerEpochSYND;
            const emissionDeltaUSD = scenario.emissionPerEpochUSD - baselineEmissionPerEpochUSD;
            const performanceDeltaSYND = scenario.performancePerEpochSYND - scenario.baselinePerformancePerEpochSYND;
            const performanceDeltaUSD = scenario.performancePerEpochUSD - scenario.baselinePerformancePerEpochUSD;

            const summaryGrid = document.getElementById('emissionSummaryGrid');
            if (summaryGrid) {
                let summaryHtml = `
                    <div class="summary-card prominent">
                        <div class="summary-card-title">Appchain Pool / Epoch</div>
                        <div class="summary-card-value">${formatNumber(scenario.emissionPerEpochSYND)} SYND</div>
                        <div class="summary-card-sub">${formatUSD(scenario.emissionPerEpochUSD)} • Δ ${emissionDeltaSYND >= 0 ? '+' : ''}${formatNumber(emissionDeltaSYND)} SYND</div>
                    </div>
                `;

                if (metricModalState.showPerformancePool) {
                    summaryHtml += `
                        <div class="summary-card">
                            <div class="summary-card-title">Performance Pool / Epoch</div>
                            <div class="summary-card-value">${formatNumber(scenario.performancePerEpochSYND)} SYND</div>
                            <div class="summary-card-sub">${formatUSD(scenario.performancePerEpochUSD)} • Δ ${performanceDeltaSYND >= 0 ? '+' : ''}${formatNumber(performanceDeltaSYND)} SYND</div>
                    </div>
                        <div class="summary-card">
                            <div class="summary-card-title">Sequencer Fees</div>
                            <div class="summary-card-value">${formatUSD(scenario.stadiumFeesPerEpochUSD)}</div>
                            <div class="summary-card-sub">≈ ${formatUSD(scenario.stadiumFeesPerDayUSD)} / day • Fee share ${scenario.feeShare.toFixed(2)}%</div>
                    </div>
                    `;
                }

                summaryHtml += `
                    <div class="summary-card">
                        <div class="summary-card-title">Stadium Share</div>
                        <div class="summary-card-value">${scenario.share.toFixed(2)}%</div>
                        <div class="summary-card-sub">
                            ${scenario.share - scenario.baselineShare >= 0 ? `<span class="summary-badge">▲ ${(scenario.share - scenario.baselineShare).toFixed(2)}%</span>` : `<span class="summary-badge" style="background: rgba(255, 122, 122, 0.12); color: var(--trend-down); border-color: rgba(255,122,122,0.45);">▼ ${Math.abs(scenario.share - scenario.baselineShare).toFixed(2)}%</span>`}
                            ${metricModalState.showPerformancePool ? ` • Perf share ${scenario.performanceShare.toFixed(2)}%` : ''}
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-card-title">Additional Stake</div>
                        <div class="summary-card-value">${formatNumber(additionalStake)} SYND</div>
                        <div class="summary-card-sub">Δ ${emissionDeltaUSD >= 0 ? '+' : ''}${formatUSD(emissionDeltaUSD)} per epoch</div>
                    </div>
                `;

                summaryGrid.innerHTML = summaryHtml;
            }

            // Combined monthly rake (appchain portion only) for display
            const combinedPerEpochSYND = scenario.emissionPerEpochSYND + scenario.performancePerEpochSYND;
            const combinedPerEpochUSD = scenario.emissionPerEpochUSD + scenario.performancePerEpochUSD;

            const allocationData = EMISSION_ALLOCATIONS.map(entry => ({
                ...entry,
                perEpochSYND: scenario.emissionPerEpochSYND * entry.percent,
                perEpochUSD: scenario.emissionPerEpochUSD * entry.percent,
                perDaySYND: scenario.emissionPerDaySYND * entry.percent,
                perDayUSD: scenario.emissionPerDayUSD * entry.percent
            }));

            const performanceAllocationData = metricModalState.showPerformancePool
                ? EMISSION_ALLOCATIONS.map(entry => ({
                    ...entry,
                    perEpochSYND: scenario.performancePerEpochSYND * entry.percent,
                    perEpochUSD: scenario.performancePerEpochUSD * entry.percent,
                    perDaySYND: scenario.performancePerDaySYND * entry.percent,
                    perDayUSD: scenario.performancePerDayUSD * entry.percent
                }))
                : null;

            renderEmissionAllocationTable(allocationData, performanceAllocationData);
            const tournamentAllocation = allocationData.find(entry => entry.key === 'tournaments');
            renderTournamentProjectionTable(tournamentAllocation, scenario.epochDays);

            metricModalState.emissionScenario = {
                additionalStake,
                transactionsPerDay,
                feePerTransactionUSD,
                networkFeesPerDayUSD,
                combinedPerEpochSYND,
                combinedPerEpochUSD
            };
        }

        function renderEmissionAllocationTable(allocationData, performanceAllocation = null) {
            const container = document.getElementById('emissionAllocationTable');
            if (!container) return;

            if (!allocationData || allocationData.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No allocation data available.</div>';
                return;
            }

            const buildTable = data => {
                const rows = data.map(entry => `
                <tr>
                    <td>
                        <div class="allocation-label">${entry.label}</div>
                        <div class="allocation-bar-track">
                            <div class="allocation-bar-fill" style="width: ${(entry.percent * 100).toFixed(0)}%;"></div>
                        </div>
                    </td>
                    <td>${(entry.percent * 100).toFixed(0)}%</td>
                    <td>${formatNumber(entry.perEpochSYND)} SYND</td>
                    <td>${formatUSD(entry.perEpochUSD)}</td>
                    <td>${formatUSD(entry.perDayUSD)} / day</td>
                </tr>
            `).join('');

                return `
                <table>
                    <thead>
                        <tr>
                            <th>Allocation</th>
                            <th>%</th>
                            <th>Per Epoch (SYND)</th>
                            <th>Per Epoch (USD)</th>
                            <th>Per Day (USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
            };

            let html = `<div class="allocation-section">
                <div class="allocation-section-title">Appchain Pool Allocation</div>
                ${buildTable(allocationData)}
            </div>`;

            if (performanceAllocation && metricModalState.showPerformancePool) {
                html += `<div class="allocation-section">
                    <div class="allocation-section-title">Performance Pool Allocation <span class="disclaimer-note">Speculative until official metrics are available.</span></div>
                    ${buildTable(performanceAllocation)}
                </div>`;
            }

            container.innerHTML = html;
        }

        function renderTournamentProjectionTable(allocation, epochDays) {
            const container = document.getElementById('tournamentProjectionTable');
            if (!container) return;

            if (!allocation) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No tournament allocation defined.</div>';
                return;
            }

            const budgetUSD = allocation.perEpochUSD || 0;
            const budgetPerDayUSD = allocation.perDayUSD || 0;
            const MATCHES_PER_DAY = 5;

            const rows = TOURNAMENT_TIERS.map(tier => {
                const minCount = Math.floor(budgetUSD / (tier.max || 1));
                const maxCount = Math.floor(budgetUSD / Math.max(tier.min, 1));
                const dailySpend = budgetPerDayUSD / MATCHES_PER_DAY;
                const dailyCapacity = Math.floor(dailySpend / Math.max(tier.max, 1));
                return `
                    <tr>
                        <td>${tier.label}</td>
                        <td>${formatUSD(tier.min)} - ${formatUSD(tier.max)}</td>
                        <td>${minCount} - ${maxCount} events</td>
                        <td>${Math.max(0, dailyCapacity)} / day (5 matches cap)</td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Tier</th>
                            <th>Prize Pool Range</th>
                            <th>Events per Epoch</th>
                            <th>Daily Capacity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        function initializeEmissionModal() {
            if (typeof metricModalState.showPerformancePool !== 'boolean') {
                metricModalState.showPerformancePool = false;
            }

            const toggleButton = document.getElementById('emissionPerformanceToggle');
            const disclaimer = document.getElementById('emissionPerformanceDisclaimer');
            const perfInputs = document.getElementById('emissionPerformanceInputs');
            const slider = document.getElementById('emissionScenarioSlider');
            const sliderInput = document.getElementById('emissionScenarioInput');
            const transactionsInput = document.getElementById('emissionTransactionsInput');
            const feeInput = document.getElementById('emissionFeeInput');
            const networkFeeInput = document.getElementById('emissionNetworkFeeInput');
            const resetButton = document.getElementById('emissionScenarioReset');

            const updateToggleState = () => {
                if (toggleButton) {
                    toggleButton.classList.toggle('active', metricModalState.showPerformancePool);
                    toggleButton.setAttribute('aria-pressed', metricModalState.showPerformancePool ? 'true' : 'false');
                }
                if (disclaimer) {
                    disclaimer.style.display = metricModalState.showPerformancePool ? 'block' : 'none';
                }
                if (perfInputs) {
                    perfInputs.style.display = metricModalState.showPerformancePool ? 'block' : 'none';
                }
            };

            const syncValue = setupEmissionScenarioControls();

            const state = metricModalState.emissionScenario
                ? {
                    additionalStake: metricModalState.emissionScenario.additionalStake ?? EMISSION_SCENARIO_DEFAULTS.additionalStake,
                    transactionsPerDay: metricModalState.emissionScenario.transactionsPerDay ?? EMISSION_SCENARIO_DEFAULTS.transactionsPerDay,
                    feePerTransactionUSD: metricModalState.emissionScenario.feePerTransactionUSD ?? EMISSION_SCENARIO_DEFAULTS.feePerTransactionUSD,
                    networkFeesPerDayUSD: metricModalState.emissionScenario.networkFeesPerDayUSD ?? EMISSION_SCENARIO_DEFAULTS.networkFeesPerDayUSD
                }
                : { ...EMISSION_SCENARIO_DEFAULTS };

            if (slider) slider.value = state.additionalStake;
            if (sliderInput) sliderInput.value = state.additionalStake;
            if (transactionsInput) transactionsInput.value = state.transactionsPerDay;
            if (feeInput) feeInput.value = state.feePerTransactionUSD;
            if (networkFeeInput) networkFeeInput.value = state.networkFeesPerDayUSD;

            if (toggleButton) {
                toggleButton.addEventListener('click', () => {
                    metricModalState.showPerformancePool = !metricModalState.showPerformancePool;
                    updateToggleState();
                    const sliderValue = parseInt(document.getElementById('emissionScenarioSlider')?.value || '0', 10);
                    updateEmissionScenario(sliderValue);
                });
            }

            updateToggleState();

            if (resetButton) {
                resetButton.addEventListener('click', () => {
                    metricModalState.emissionScenario = { ...EMISSION_SCENARIO_DEFAULTS };
                    if (slider) slider.value = EMISSION_SCENARIO_DEFAULTS.additionalStake;
                    if (sliderInput) sliderInput.value = EMISSION_SCENARIO_DEFAULTS.additionalStake;
                    if (transactionsInput) transactionsInput.value = EMISSION_SCENARIO_DEFAULTS.transactionsPerDay;
                    if (feeInput) feeInput.value = EMISSION_SCENARIO_DEFAULTS.feePerTransactionUSD;
                    if (networkFeeInput) networkFeeInput.value = EMISSION_SCENARIO_DEFAULTS.networkFeesPerDayUSD;
                    updateEmissionScenario(EMISSION_SCENARIO_DEFAULTS.additionalStake);
                });
            }

            const sliderValue = Number.isFinite(state.additionalStake) ? state.additionalStake : EMISSION_SCENARIO_DEFAULTS.additionalStake;
            updateEmissionScenario(sliderValue);
        }

        function updateRankScenario(additionalStake = 0) {
            const simulation = simulateNetworkWithAdditionalStake(additionalStake);
            if (!simulation) return;

            const stadiumId = CONFIG.STADIUM_APPCHAIN_ID;
            const appchainPoolEmission = currentStats.emissions?.appchainPoolEmissionPerEpoch || 0;
            const epochDays = currentStats.emissions?.epochDurationDays || 30;

            const { ecosystem: updated, stadium, nextHigher } = simulation;
            const currentRank = currentStats.stadium.rank || 0;
            const rankChange = stadium ? (currentRank || stadium.rank) - stadium.rank : 0;
            const distanceToNext = nextHigher ? Math.max(0, nextHigher.total - stadium.total) : 0;

            const newEmissionPerEpoch = stadium ? appchainPoolEmission * (stadium.share / 100) : 0;
            const newEmissionPerDay = newEmissionPerEpoch / epochDays;

            const summary = document.getElementById('rankScenarioSummary');
            if (summary) {
                summary.innerHTML = `
                    <div>
                        <div class="summary-label">Projected Rank</div>
                        <div class="summary-value">#${stadium ? stadium.rank : currentRank}</div>
                        <div class="summary-subtext">${rankChange > 0 ? `<span class="summary-badge">▲ ${rankChange} positions</span>` : rankChange < 0 ? `<span class="summary-badge" style="background: rgba(255, 122, 122, 0.12); color: var(--trend-down); border-color: rgba(255,122,122,0.45);">▼ ${Math.abs(rankChange)} positions</span>` : 'No change'}</div>
                    </div>
                    <div>
                        <div class="summary-label">Projected Share</div>
                        <div class="summary-value">${stadium ? stadium.share.toFixed(2) : (currentStats.stadium.networkShare || 0).toFixed(2)}%</div>
                        <div class="summary-subtext">Additional stake: ${formatNumber(additionalStake)} SYND</div>
                    </div>
                    <div>
                        <div class="summary-label">Projected Emissions / Epoch</div>
                        <div class="summary-value">${formatNumber(newEmissionPerEpoch)} SYND</div>
                        <div class="summary-subtext">≈ ${formatNumber(newEmissionPerDay)} SYND / day</div>
                    </div>
                    <div>
                        <div class="summary-label">Distance to Next Rank</div>
                        <div class="summary-value">${distanceToNext > 0 ? formatNumber(distanceToNext) + ' SYND' : 'Lead secured'}</div>
                        <div class="summary-subtext">${nextHigher ? `Target: ${formatAppchainLabel(nextHigher.appchainId)}` : 'You are #1'}</div>
                    </div>
                `;
            }

            const tableContainer = document.getElementById('rankTableContainer');
            if (tableContainer) {
                const rows = updated.map(item => {
                    const change = (currentStats.ecosystem.find(ec => ec.appchainId === item.appchainId)?.rank || item.rank) - item.rank;
                    const changeBadge = change > 0 ? `<span class="summary-badge">▲ ${change}</span>` : change < 0 ? `<span class="summary-badge" style="background: rgba(255, 122, 122, 0.12); color: var(--trend-down); border-color: rgba(255,122,122,0.45);">▼ ${Math.abs(change)}</span>` : '—';
                    return `
                        <tr ${item.appchainId === stadiumId ? 'class="highlight"' : ''}>
                            <td>#${item.rank}</td>
                            <td>${formatAppchainLabel(item.appchainId)}</td>
                            <td>${formatNumber(item.total)} SYND</td>
                            <td>${item.share.toFixed(2)}%</td>
                            <td>${changeBadge}</td>
                        </tr>
                    `;
                }).join('');

                tableContainer.innerHTML = `
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Appchain</th>
                                <th>Total Staked</th>
                                <th>Share</th>
                                <th>Δ Rank</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                `;
            }
        }

        const STADIUM_STAGES = [
            {
                id: 'foundation',
                label: 'Foundation',
                min: 0,
                max: 250000,
                previewTotal: 250000,
                description: 'Lay structural supports, utilities, and access tunnels.'
            },
            {
                id: 'lower-bowl',
                label: 'Lower Bowl',
                min: 250000,
                max: 500000,
                previewTotal: 500000,
                description: 'Raise lower seating bowl and concourse infrastructure.'
            },
            {
                id: 'upper-bowl',
                label: 'Upper Bowl',
                min: 500000,
                max: 1000000,
                previewTotal: 1000000,
                description: 'Complete upper seating tiers and broadcast decks.'
            },
            {
                id: 'illumination',
                label: 'Illumination',
                min: 1000000,
                max: Infinity,
                previewTotal: 1250000,
                description: 'Light the crown, open the gates, and celebrate a live stadium.'
            }
        ];

        // Stadium visualization (SVG linework)
        const stadiumSvg = document.getElementById('stadiumSvg');
        const svgNS = 'http://www.w3.org/2000/svg';
        const STADIUM_SVG_CONFIG = {
            centerX: 450,
            baselineY: 540,
            verticalScale: 0.62,
            frontGap: Math.PI * 0.32
        };

        const STADIUM_SECTION_PROFILES = {
            foundation: { outerRadius: 360, innerRadius: 250, height: 60 },
            lower: { outerRadius: 320, innerRadius: 190 },
            upper: { outerRadius: 260, innerRadius: 130 },
            crown: { outerRadius: 190, innerRadius: 70 }
        };

        const STADIUM_COLORS = {
            foundationFill: '#17242F',
            foundationStroke: 'rgba(96, 130, 150, 0.45)',
            lowerFill: '#133240',
            lowerStroke: '#76F6FF',
            upperFill: '#163949',
            upperStroke: '#7FEAC3',
            crownFill: '#1A3E52',
            crownStroke: '#76F6FF',
            radialStroke: 'rgba(118, 246, 255, 0.22)'
        };

        function svgCreate(tag, attrs = {}) {
            const el = document.createElementNS(svgNS, tag);
            Object.entries(attrs).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    el.setAttribute(key, value);
                }
            });
            return el;
        }

        function svgAppend(tag, attrs = {}) {
            if (!stadiumSvg) return null;
            const el = svgCreate(tag, attrs);
            stadiumSvg.appendChild(el);
            return el;
        }

        function clearStadiumSvg() {
            if (!stadiumSvg) return;
            while (stadiumSvg.firstChild) {
                stadiumSvg.removeChild(stadiumSvg.firstChild);
            }
        }

        function svgPolar(radius, angle) {
            return {
                x: STADIUM_SVG_CONFIG.centerX + radius * Math.cos(angle),
                y: STADIUM_SVG_CONFIG.baselineY + STADIUM_SVG_CONFIG.verticalScale * radius * Math.sin(angle)
            };
        }

        function svgRingPath(outerRadius, innerRadius) {
            const startAngle = Math.PI + STADIUM_SVG_CONFIG.frontGap;
            const endAngle = -STADIUM_SVG_CONFIG.frontGap;
            const outerStart = svgPolar(outerRadius, startAngle);
            const outerEnd = svgPolar(outerRadius, endAngle);
            const pathParts = [
                `M ${outerStart.x.toFixed(1)} ${outerStart.y.toFixed(1)}`,
                `A ${outerRadius.toFixed(1)} ${(outerRadius * STADIUM_SVG_CONFIG.verticalScale).toFixed(1)} 0 0 1 ${outerEnd.x.toFixed(1)} ${outerEnd.y.toFixed(1)}`
            ];

            if (innerRadius > 0) {
                const innerStart = svgPolar(innerRadius, endAngle);
                const innerEnd = svgPolar(innerRadius, startAngle);
                pathParts.push(
                    `L ${innerStart.x.toFixed(1)} ${innerStart.y.toFixed(1)}`,
                    `A ${innerRadius.toFixed(1)} ${(innerRadius * STADIUM_SVG_CONFIG.verticalScale).toFixed(1)} 0 0 0 ${innerEnd.x.toFixed(1)} ${innerEnd.y.toFixed(1)}`
                );
            } else {
                pathParts.push(`L ${STADIUM_SVG_CONFIG.centerX.toFixed(1)} ${STADIUM_SVG_CONFIG.baselineY.toFixed(1)}`);
            }

            pathParts.push('Z');
            return pathParts.join(' ');
        }

        function drawFoundationSvg(progress) {
            if (!stadiumSvg) return;
            const width = 720;
            const height = STADIUM_SECTION_PROFILES.foundation.height;
            const fillOpacity = Math.min(0.85, 0.35 + progress * 0.3);
            svgAppend('rect', {
                x: (STADIUM_SVG_CONFIG.centerX - width / 2).toFixed(1),
                y: (STADIUM_SVG_CONFIG.baselineY + 36).toFixed(1),
                width,
                height,
                rx: 18,
                fill: STADIUM_COLORS.foundationFill,
                'fill-opacity': fillOpacity,
                stroke: STADIUM_COLORS.foundationStroke,
                'stroke-width': 2,
                'stroke-opacity': 0.4 + progress * 0.3
            });
        }

        function drawRingSvg(sectionKey, progress, options = {}) {
            if (progress <= 0 || !stadiumSvg) return;
            const section = STADIUM_SECTION_PROFILES[sectionKey];
            if (!section) return;

            const fill = options.fill || '#12303C';
            const stroke = options.stroke || 'rgba(118,246,255,0.5)';
            const baseFillOpacity = options.baseOpacity ?? 0.18;
            const fillOpacity = Math.min(1, baseFillOpacity + (options.opacityScale ?? 0.5) * progress);
            const strokeOpacity = Math.min(1, (options.strokeBaseOpacity ?? 0.45) + (options.strokeOpacityScale ?? 0.4) * progress);

            svgAppend('path', {
                d: svgRingPath(section.outerRadius, section.innerRadius),
                fill,
                'fill-opacity': fillOpacity,
                stroke,
                'stroke-opacity': strokeOpacity,
                'stroke-width': options.strokeWidth || 2.4
            });
        }

        function drawRadialsSvg(sectionKey, progress, options = {}) {
            if (progress <= 0 || !stadiumSvg) return;
            const section = STADIUM_SECTION_PROFILES[sectionKey];
            if (!section) return;

            const count = Math.max(3, Math.round((options.count || 24) * progress));
            const group = svgCreate('g', {
                stroke: options.stroke || STADIUM_COLORS.radialStroke,
                'stroke-width': options.strokeWidth || 1,
                'stroke-opacity': Math.min(0.7, (options.baseOpacity ?? 0.16) + (options.opacityScale ?? 0.25) * progress),
                'stroke-dasharray': options.dash || '12 8',
                'stroke-linecap': 'round'
            });

            const outerRadius = section.outerRadius;
            const innerRadius = Math.max(section.innerRadius, outerRadius - 80);

            for (let i = 1; i < count; i++) {
                const fraction = i / count;
                const angle = Math.PI + STADIUM_SVG_CONFIG.frontGap - ((Math.PI - STADIUM_SVG_CONFIG.frontGap * 2) * fraction);
                if (Math.abs(angle - Math.PI / 2) < STADIUM_SVG_CONFIG.frontGap * 0.75) continue;
                const outer = svgPolar(outerRadius, angle);
                const inner = svgPolar(innerRadius, angle);
                group.appendChild(svgCreate('line', {
                    x1: outer.x.toFixed(1),
                    y1: outer.y.toFixed(1),
                    x2: inner.x.toFixed(1),
                    y2: inner.y.toFixed(1)
                }));
            }

            stadiumSvg.appendChild(group);
        }

        function drawFieldSvg(progress) {
            if (!stadiumSvg) return;
            const group = svgCreate('g', {
                stroke: 'rgba(118,246,255,0.45)',
                'stroke-linecap': 'round',
                'stroke-width': 1.8,
                'stroke-opacity': 0.35 + progress * 0.3,
                fill: 'none'
            });

            const radius = 150;
            const startAngle = Math.PI + STADIUM_SVG_CONFIG.frontGap * 1.15;
            const endAngle = -STADIUM_SVG_CONFIG.frontGap * 1.15;
            const start = svgPolar(radius, startAngle);
            const end = svgPolar(radius, endAngle);
            group.appendChild(svgCreate('path', {
                d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius.toFixed(1)} ${(radius * STADIUM_SVG_CONFIG.verticalScale).toFixed(1)} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
            }));

            group.appendChild(svgCreate('ellipse', {
                cx: STADIUM_SVG_CONFIG.centerX,
                cy: (STADIUM_SVG_CONFIG.baselineY + 12).toFixed(1),
                rx: 60,
                ry: (60 * STADIUM_SVG_CONFIG.verticalScale * 0.6).toFixed(1),
                'stroke-dasharray': '10 8'
            }));

            group.appendChild(svgCreate('line', {
                x1: (STADIUM_SVG_CONFIG.centerX - 120).toFixed(1),
                y1: (STADIUM_SVG_CONFIG.baselineY + 12).toFixed(1),
                x2: (STADIUM_SVG_CONFIG.centerX + 120).toFixed(1),
                y2: (STADIUM_SVG_CONFIG.baselineY + 12).toFixed(1),
                'stroke-dasharray': '14 12'
            }));

            stadiumSvg.appendChild(group);
        }

        function drawFacadeSvg(completion) {
            if (!stadiumSvg || completion < 0.6) return;
            const columns = Math.round(16 + (completion - 0.6) * 24);
            const radius = STADIUM_SECTION_PROFILES.foundation.outerRadius + 28;
            const height = 140 + (completion - 0.6) * 160;
            const group = svgCreate('g', {
                stroke: 'rgba(118,246,255,0.22)',
                'stroke-width': 1.2,
                'stroke-opacity': 0.28 + (completion - 0.6) * 0.5,
                'stroke-linecap': 'round',
                fill: 'none'
            });

            for (let i = 0; i <= columns; i++) {
                const fraction = i / columns;
                const angle = Math.PI + STADIUM_SVG_CONFIG.frontGap - ((Math.PI - STADIUM_SVG_CONFIG.frontGap * 2) * fraction);
                const base = svgPolar(radius, angle);
                const top = { x: base.x, y: base.y - height };
                group.appendChild(svgCreate('line', {
                    x1: base.x.toFixed(1),
                    y1: (base.y + 24).toFixed(1),
                    x2: top.x.toFixed(1),
                    y2: top.y.toFixed(1)
                }));
            }

            const rimStart = svgPolar(radius, Math.PI + STADIUM_SVG_CONFIG.frontGap);
            const rimEnd = svgPolar(radius, -STADIUM_SVG_CONFIG.frontGap);
            group.appendChild(svgCreate('path', {
                d: `M ${rimStart.x.toFixed(1)} ${rimStart.y.toFixed(1)} A ${radius.toFixed(1)} ${(radius * STADIUM_SVG_CONFIG.verticalScale).toFixed(1)} 0 0 1 ${rimEnd.x.toFixed(1)} ${rimEnd.y.toFixed(1)}`,
                'stroke-dasharray': '18 12',
                'stroke-width': 2
            }));

            stadiumSvg.appendChild(group);
        }

        function renderStadiumSvg(progress) {
            if (!stadiumSvg) return;
            clearStadiumSvg();

            drawFoundationSvg(progress.lower);
            drawRingSvg('lower', progress.lower, {
                fill: STADIUM_COLORS.lowerFill,
                stroke: STADIUM_COLORS.lowerStroke,
                baseOpacity: 0.2,
                opacityScale: 0.55,
                strokeWidth: 2.6
            });
            drawRadialsSvg('lower', progress.lower, { count: 26 });

            drawRingSvg('upper', progress.upper, {
                fill: STADIUM_COLORS.upperFill,
                stroke: STADIUM_COLORS.upperStroke,
                baseOpacity: 0.18,
                opacityScale: 0.5,
                strokeWidth: 2.2
            });
            drawRadialsSvg('upper', progress.upper, { count: 28, baseOpacity: 0.14, opacityScale: 0.24, strokeWidth: 0.9, dash: '10 8' });

            drawRingSvg('crown', progress.crown, {
                fill: STADIUM_COLORS.crownFill,
                stroke: STADIUM_COLORS.crownStroke,
                baseOpacity: 0.16,
                opacityScale: 0.55,
                strokeWidth: 1.8
            });

            drawFieldSvg(progress.lower);
            drawFacadeSvg(computeOverallCompletion(progress));
        }

        const visualizerTooltip = document.getElementById('visualizerTooltip');
        const isoContainer = document.querySelector('.iso-container');

        let visualizerStakers = [];
        let liveTotalStaked = 0;

        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

        function formatCompact(amount) {
            if (amount === Infinity) return '∞';
            if (amount >= 1000000) {
                const value = (amount / 1000000).toFixed(1);
                return `${value.replace(/\.0$/, '')}M`;
            }
            if (amount >= 1000) {
                const value = (amount / 1000).toFixed(0);
                return `${value}K`;
            }
            return amount.toLocaleString('en-US');
        }

        function computeStadiumProgress(totalStaked) {
            return {
                lower: clamp(totalStaked / 250000, 0, 1),
                upper: clamp((totalStaked - 250000) / 250000, 0, 1),
                crown: clamp((totalStaked - 500000) / 500000, 0, 1)
            };
        }

        function computeOverallCompletion(progress) {
            if (!progress) return 0;
            const weights = { lower: 0.4, upper: 0.35, crown: 0.25 };
            return (progress.lower * weights.lower) +
                   (progress.upper * weights.upper) +
                   (progress.crown * weights.crown);
        }

        function getStageById(stageId) {
            return STADIUM_STAGES.find(stage => stage.id === stageId) || null;
        }

        function getStageTimelineLabel(stage) {
            if (!stage) return '';
            if (stage.max === Infinity) {
                return `@ ${formatCompact(stage.min)}+ SYND`;
            }
            return `@ ${formatCompact(stage.max)} SYND`;
        }

        function formatStagePreviewAmount(stage) {
            if (!stage) return '';
            if (stage.max === Infinity) {
                return `${formatCompact(stage.min)}+ SYND`;
            }
            return `${formatCompact(stage.max)} SYND`;
        }

        function getStagePreviewTotal(stage) {
            if (!stage) return liveTotalStaked;
            if (typeof stage.previewTotal === 'number') {
                return stage.previewTotal;
            }
            if (stage.max === Infinity) {
                return stage.min + 250000;
            }
            return stage.max;
        }

        function getVisualizerTotal() {
            return liveTotalStaked;
        }

        function refreshStageIndicator() {
            updateStageIndicator(liveTotalStaked);
        }


        function drawRadialRibs() {}

        function drawSeatingTerraces() {}


        function renderVisualizer() {
            const stadiumImage = document.getElementById('stadiumImage');
            if (!stadiumImage) return;
            if (window.innerWidth <= 768 && !isoContainer.classList.contains('visible')) {
                return;
            }
            // Image is static, no rendering logic needed
        }

        function drawNodeMarkers() {}

        function updateStageIndicator(totalStaked) {
            const indicator = document.getElementById('stadiumStageIndicator');
            if (!indicator) return;

            const stageCurrentLabel = document.getElementById('stageCurrentLabel');
            const stageCurrentDescription = document.getElementById('stageCurrentDescription');
            const stageProgressFill = document.getElementById('stageProgressFill');
            const stageProgressText = document.getElementById('stageProgressText');
            const stageNextLabel = document.getElementById('stageNextLabel');
            const stageNextDescription = document.getElementById('stageNextDescription');
            const stageNextGoal = document.getElementById('stageNextGoal');

            const currentStage = STADIUM_STAGES.find(stage => totalStaked < stage.max) || STADIUM_STAGES[STADIUM_STAGES.length - 1];
            const currentIndex = STADIUM_STAGES.indexOf(currentStage);
            const nextStage = currentStage.max === Infinity ? null : STADIUM_STAGES[currentIndex + 1] || null;

            const stageMin = currentStage.min;
            const stageMax = currentStage.max;
            const stageProgress = stageMax === Infinity ? 1 : clamp((totalStaked - stageMin) / (stageMax - stageMin), 0, 1);

            // Format stage labels with Roman numerals
            const stageLabels = ['I. FOUNDATION', 'II. LOWER BOWL', 'III. UPPER BOWL', 'IV. ILLUMINATION'];
            
            if (stageCurrentLabel) {
                stageCurrentLabel.textContent = stageLabels[currentIndex] || currentStage.label.toUpperCase();
            }
            if (stageCurrentDescription) {
                stageCurrentDescription.textContent = currentStage.description.toUpperCase();
            }
            if (stageProgressFill) {
                const progressBar = stageProgressFill.parentElement;
                const availableWidth = progressBar ? progressBar.offsetWidth - 8 : 0; // Account for 4px padding on each side
                const fillWidth = (stageProgress * availableWidth);
                stageProgressFill.style.width = `${fillWidth}px`;
            }

            if (stageProgressText) {
                if (stageMax === Infinity) {
                    stageProgressText.textContent = `${formatCompact(totalStaked)} / ${formatCompact(totalStaked)} SYND`;
                } else {
                    const currentValue = clamp(totalStaked, stageMin, stageMax);
                    stageProgressText.textContent = `${formatCompact(currentValue)} / ${formatCompact(stageMax)} SYND`;
                }
            }

            if (nextStage) {
                const nextIndex = STADIUM_STAGES.indexOf(nextStage);
                const stageNextValue = document.getElementById('stageNextValue');
                if (stageNextLabel) {
                    stageNextLabel.textContent = `NEXT STEP [${nextIndex + 1}/4]`;
                }
                if (stageNextValue) {
                    stageNextValue.textContent = stageLabels[nextIndex] || nextStage.label.toUpperCase();
                }
            } else {
                if (stageNextLabel) {
                    stageNextLabel.textContent = 'STADIUM COMPLETE';
                }
                const stageNextValue = document.getElementById('stageNextValue');
                if (stageNextValue) {
                    stageNextValue.textContent = 'ALL PHASES COMPLETE';
                }
            }
        }


        function updateUI(stats) {
            const previousStats = currentStats;
            currentStats = stats;
            baselineMetrics = computeBaselineMetrics(stats);
            
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('errorState').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            document.getElementById('statusText').textContent = 'SYSTEM OPERATIONAL';

            // Update total staked
            const totalStaked = stats.stadium.totalStaked;
            document.getElementById('totalStaked').textContent = formatNumber(totalStaked);
            liveTotalStaked = totalStaked;
            
            // Update subtitle with USD if available
            if (stats.price && stats.price.price > 0) {
                const totalUsdValue = totalStaked * stats.price.price;
                let usdFormatted;
                if (totalUsdValue >= 1000000) {
                    usdFormatted = `$${(totalUsdValue / 1000000).toFixed(2)}M`;
                } else if (totalUsdValue >= 1000) {
                    usdFormatted = `$${(totalUsdValue / 1000).toFixed(0)}K`;
                } else {
                    usdFormatted = `$${totalUsdValue.toFixed(0)}`;
                }
                const subtitleEl = document.getElementById('totalStakedSubtitle');
                subtitleEl.innerHTML = `of <span class="synd-link" id="syndLink">$SYND</span> locked in network (${usdFormatted} USD)`;
                setupSyndTooltip();
            } else {
                const subtitleEl = document.getElementById('totalStakedSubtitle');
                subtitleEl.innerHTML = `of <span class="synd-link" id="syndLink">$SYND</span> locked in network`;
                setupSyndTooltip();
            }

            // Update goals progress
            if (stats.goals && stats.goals.current) {
                const goalProgress = typeof stats.goals.progress === 'number' ? stats.goals.progress : 0;
                const goalProgressBar = document.getElementById('goalProgress');
                if (goalProgressBar) {
                    const progressBar = goalProgressBar.parentElement;
                    const availableWidth = progressBar ? progressBar.offsetWidth - 8 : 0; // Account for 4px padding on each side
                    const fillWidth = (Math.min(goalProgress, 100) / 100) * availableWidth;
                    goalProgressBar.style.width = `${fillWidth}px`;
                }
                const goalLabel = stats.goals.current.label.replace(' SYND', ' $SYND');
                document.getElementById('goalLabel').innerHTML = 
                    `NEXT GOAL: ${goalLabel} / ${goalProgress.toFixed(1)}% COMPLETE`;
            } else {
                const goalProgressBar = document.getElementById('goalProgress');
                if (goalProgressBar) {
                    goalProgressBar.style.width = '0px';
                }
                document.getElementById('goalLabel').textContent = 'NEXT GOAL: --';
            }

            // Update epoch info
            if (stats.emissions && stats.emissions.epochNumber) {
                const epochNumber = stats.emissions.epochNumber;
                // Calculate epoch dates (assuming epoch 1 starts Oct 30, 2024)
                const epochStartDate = new Date('2024-10-30');
                const epochDuration = stats.emissions.epochDurationDays || 30;
                const currentEpochStart = new Date(epochStartDate);
                currentEpochStart.setDate(epochStartDate.getDate() + (epochNumber - 1) * epochDuration);
                const currentEpochEnd = new Date(currentEpochStart);
                currentEpochEnd.setDate(currentEpochStart.getDate() + epochDuration);
                
                const startMonth = currentEpochStart.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                const startDay = currentEpochStart.getDate();
                const endMonth = currentEpochEnd.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                const endDay = currentEpochEnd.getDate();
                
                const epochInfoEl = document.getElementById('epochInfo');
                if (epochInfoEl) {
                    epochInfoEl.textContent = `epoch ${epochNumber} - ${startMonth} ${startDay} - ${endMonth} ${endDay}`;
                }
            }
            
            // Store all stakers for node details
            allStakersData = stats.allStakers || [];

            refreshStageIndicator();

            // Update metrics
            const totalStakers = stats.stadium.totalStakers;
            document.getElementById('stakerCount').textContent = totalStakers;
            const stakerCountTrendEl = document.getElementById('stakerCountTrend');
            
            const avgPerNode = totalStakers > 0 ? totalStaked / totalStakers : 0;
            document.getElementById('avgPerNode').textContent = formatNumber(avgPerNode);
            const avgPerNodeTrendEl = document.getElementById('avgPerNodeTrend');
            
            const networkShare = stats.stadium.networkShare || 0;
            document.getElementById('networkShare').textContent = `${typeof networkShare === 'number' ? networkShare.toFixed(2) : '0.00'}%`;
            const networkShareTrendEl = document.getElementById('networkShareTrend');
            document.getElementById('rank').textContent = `#${stats.stadium.rank || '-'}`;
            const rankTrendEl = document.getElementById('rankTrend');

            const baselineLabel = baselineMetrics ? formatBaselineLabel(baselineMetrics.date) : 'vs last refresh';

            const prevTotalStakers = baselineMetrics?.totalStakers ?? previousStats?.stadium?.totalStakers;
            const prevTotalStaked = baselineMetrics?.totalStaked ?? previousStats?.stadium?.totalStaked;
            const prevAvgPerNode = (typeof prevTotalStakers === 'number' && prevTotalStakers > 0 && typeof prevTotalStaked === 'number')
                ? prevTotalStaked / prevTotalStakers
                : undefined;
            const prevNetworkShare = baselineMetrics ? undefined : previousStats?.stadium?.networkShare;
            const prevRank = baselineMetrics ? undefined : previousStats?.stadium?.rank;

            setTrend(stakerCountTrendEl, totalStakers, prevTotalStakers, {
                betterDirection: 'up',
                format: 'percent',
                decimals: 1,
                referenceLabel: baselineLabel
            });

            setTrend(avgPerNodeTrendEl, avgPerNode, prevAvgPerNode, {
                betterDirection: 'up',
                format: 'percent',
                decimals: 1,
                referenceLabel: baselineLabel
            });

            setTrend(networkShareTrendEl, networkShare, prevNetworkShare, {
                betterDirection: 'up',
                format: 'percent',
                decimals: 2,
                threshold: 0.01,
                referenceLabel: 'vs last refresh'
            });

            setTrend(rankTrendEl, stats.stadium.rank, prevRank, {
                betterDirection: 'down',
                format: 'number',
                decimals: 0,
                threshold: 0.5,
                referenceLabel: 'vs last refresh'
            });

            const emissions = stats.emissions || {};
            const emissionPerEpoch = typeof emissions.stadiumEmissionPerEpoch === 'number' ? emissions.stadiumEmissionPerEpoch : 0;
            const emissionPerDay = typeof emissions.stadiumEmissionPerDay === 'number' ? emissions.stadiumEmissionPerDay : 0;
            const emissionPerEpochUSD = typeof emissions.stadiumEmissionPerEpochUSD === 'number' ? emissions.stadiumEmissionPerEpochUSD : 0;
            const emissionPerDayUSD = typeof emissions.stadiumEmissionPerDayUSD === 'number' ? emissions.stadiumEmissionPerDayUSD : 0;
            const epochLabel = emissions.epochNumber ? `Epoch ${emissions.epochNumber}` : 'Epoch --';
            const poolSharePct = typeof emissions.appchainPoolShare === 'number' ? (emissions.appchainPoolShare * 100).toFixed(0) : null;
            const poolLabel = poolSharePct ? `${poolSharePct}% appchain pool` : 'Appchain pool';
            const epochDuration = emissions.epochDurationDays || 30;

            const emissionEpochEl = document.getElementById('emissionEpoch');
            const emissionEpochUSDEl = document.getElementById('emissionEpochUSD');
            const emissionEpochDetailEl = document.getElementById('emissionEpochDetail');
            const emissionDayEl = document.getElementById('emissionDay');
            const emissionDayUSDEl = document.getElementById('emissionDayUSD');
            const emissionDayDetailEl = document.getElementById('emissionDayDetail');

            if (emissionEpochEl && emissionEpochDetailEl) {
                emissionEpochEl.textContent = `${formatNumber(emissionPerEpoch)} SYND`;
                emissionEpochDetailEl.textContent = `${epochLabel} · ${poolLabel}`;
                
                // Add USD value if available (styled like totalStakedSubtitle)
                if (emissionEpochUSDEl && emissionPerEpochUSD > 0) {
                    let usdFormatted;
                    if (emissionPerEpochUSD >= 1000000) {
                        usdFormatted = `$${(emissionPerEpochUSD / 1000000).toFixed(2)}M`;
                    } else if (emissionPerEpochUSD >= 1000) {
                        usdFormatted = `$${(emissionPerEpochUSD / 1000).toFixed(0)}K`;
                    } else {
                        usdFormatted = `$${emissionPerEpochUSD.toFixed(0)}`;
                    }
                    emissionEpochUSDEl.textContent = `(${usdFormatted} USD)`;
                    emissionEpochUSDEl.style.display = 'block';
                } else if (emissionEpochUSDEl) {
                    emissionEpochUSDEl.style.display = 'none';
                }
            }

            if (emissionDayEl && emissionDayDetailEl) {
                emissionDayEl.textContent = `${formatNumber(emissionPerDay)} SYND`;
                emissionDayDetailEl.textContent = `Based on ${epochDuration}-day epoch`;
                
                // Add USD value if available (styled like totalStakedSubtitle)
                if (emissionDayUSDEl && emissionPerDayUSD > 0) {
                    let usdFormatted;
                    if (emissionPerDayUSD >= 1000) {
                        usdFormatted = `$${(emissionPerDayUSD / 1000).toFixed(0)}K`;
                    } else {
                        usdFormatted = `$${emissionPerDayUSD.toFixed(0)}`;
                    }
                    emissionDayUSDEl.textContent = `(${usdFormatted} USD/day)`;
                    emissionDayUSDEl.style.display = 'block';
                } else if (emissionDayUSDEl) {
                    emissionDayUSDEl.style.display = 'none';
                }
            }

            refreshMetricModal();

            // Update node grid with clickable nodes and quality indicators
            const nodeGrid = document.getElementById('nodeGrid');
            nodeGrid.innerHTML = '';
            const maxNodes = 30;
            
            // Get sorted stakers - use allStakersData if available, otherwise create from top10
            let sortedStakers = [];
            if (allStakersData && allStakersData.length > 0) {
                sortedStakers = [...allStakersData].sort((a, b) => (b.amount || 0) - (a.amount || 0));
            } else if (stats.top10 && stats.top10.length > 0) {
                // Fallback to top10 if allStakersData is not available
                sortedStakers = stats.top10.map(s => ({
                    address: s.address,
                    amount: s.amount,
                    percentage: s.percentage,
                    quality: s.quality || { score: 0 }
                }));
            }
            
            // Use the actual number of stakers we have, not just totalStakers
            const activeNodeCount = Math.min(totalStakers, sortedStakers.length, maxNodes);
            
            for (let i = 0; i < maxNodes; i++) {
                const node = document.createElement('div');
                node.className = 'node';
                
                if (i < activeNodeCount && sortedStakers[i]) {
                    node.classList.add('active');
                    node.textContent = i + 1;
                    
                    // Add on icon for active nodes (replaces quality indicator)
                    const onIcon = document.createElement('div');
                    onIcon.className = 'node-on-icon';
                    node.appendChild(onIcon);
                    
                    // Make clickable - ensure we have the address
                    const stakerAddress = sortedStakers[i].address;
                    if (stakerAddress) {
                        node.style.cursor = 'pointer';
                        node.addEventListener('click', (e) => {
                            e.stopPropagation();
                            console.log('Node clicked:', stakerAddress);
                            showNodeDetails(stakerAddress);
                        });
                    }
                }
                nodeGrid.appendChild(node);
            }
            
            visualizerStakers = sortedStakers;
            renderVisualizer();

            // Update network position
            const totalNetwork = (stats.ecosystem || []).reduce((sum, item) => sum + (item.total || 0), 0);
            const ecosystemLength = (stats.ecosystem || []).length;
            document.getElementById('currentRank').textContent = 
                `#${stats.stadium.rank || '-'} of ${ecosystemLength}`;
            document.getElementById('totalNetwork').textContent = formatNumber(totalNetwork) + ' SYND';

            // Update timestamp
            const now = new Date();
            document.getElementById('lastUpdated').textContent = now.toLocaleTimeString();

            // Update top stakers
            const topStakersEl = document.getElementById('topStakers');
            topStakersEl.innerHTML = '';
            stats.top10.slice(0, 5).forEach((staker, i) => {
                const item = document.createElement('div');
                item.className = 'staker-item';
                item.innerHTML = `
                    <span class="staker-rank">#${i+1}</span>
                    <span class="staker-address">${formatAddress(staker.address)}</span>
                    <span class="staker-amount">${formatNumber(staker.amount)}</span>
                    <span class="staker-percent">${staker.percentage.toFixed(2)}%</span>
                `;
                topStakersEl.appendChild(item);
            });
            
            // Load snapshots
            loadSnapshots();
            
            // Load charts on mobile
            if (window.innerWidth <= 768) {
                loadCharts();
            }
        }
        
        async function loadSnapshots() {
            try {
                const response = await fetch('/api/snapshots?limit=10');
                if (!response.ok) return;
                
                const data = await response.json();
                const snapshotsList = document.getElementById('snapshotsList');
                
                if (!data.snapshots || data.snapshots.length === 0) {
                    snapshotsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 11px;">No snapshots yet</div>';
                    return;
                }
                
                snapshotsList.innerHTML = data.snapshots.map(snapshot => {
                    const date = new Date(snapshot.date);
                    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return `
                        <div class="mini-stat" style="cursor: pointer;" onclick="showSnapshotDetails('${snapshot.date}')">
                            <span class="mini-stat-label">${dateStr}</span>
                            <span class="mini-stat-value">${formatNumber(snapshot.totalStaked)} SYND</span>
                        </div>
                    `;
                }).join('');
            } catch (error) {
                console.error('Error loading snapshots:', error);
            }
        }
        
        async function showSnapshotDetails(date) {
            try {
                const response = await fetch('/api/snapshots');
                if (!response.ok) return;
                
                const data = await response.json();
                const snapshot = data.snapshots.find(s => s.date === date);
                if (!snapshot) return;
                
                const modal = document.getElementById('nodeModal');
                const body = document.getElementById('nodeModalBody');
                
                const dateObj = new Date(snapshot.date);
                const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                
                body.innerHTML = `
                    <div class="node-detail-item">
                        <div class="node-detail-label">Snapshot Date</div>
                        <div class="node-detail-value">${dateStr}</div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Total Staked</div>
                        <div class="node-detail-value">${formatNumber(snapshot.totalStaked)} SYND</div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Total Stakers</div>
                        <div class="node-detail-value">${snapshot.totalStakers}</div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Network Rank</div>
                        <div class="node-detail-value">#${snapshot.rank}</div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Network Share</div>
                        <div class="node-detail-value">${snapshot.networkShare.toFixed(2)}%</div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Top 10 Stakers</div>
                        <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; margin-top: 8px;">
                            ${snapshot.top10.map((staker, i) => `
                                <div class="history-item">
                                    <span>#${staker.rank}</span>
                                    <span style="font-family: monospace; font-size: 10px;">${formatAddress(staker.address)}</span>
                                    <span>${formatNumber(staker.amount)} SYND</span>
                                    <span style="color: var(--text-muted);">${staker.percentage.toFixed(2)}%</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                
                // Update modal title
                document.querySelector('#nodeModal .modal-title').textContent = `Snapshot: ${dateStr}`;
                modal.classList.add('visible');
            } catch (error) {
                console.error('Error showing snapshot details:', error);
            }
        }

        function showError(message) {
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('errorState').style.display = 'block';
            document.getElementById('errorMessage').textContent = message;
            document.getElementById('statusText').textContent = 'SYSTEM ERROR';
        }

        async function fetchData() {
            try {
                console.log('Fetching staking data...');
                
                const response = await fetch(CONFIG.API_ENDPOINT);
                if (!response.ok) {
                    throw new Error(`API returned ${response.status}: ${response.statusText}`);
                }
                
                const stats = await response.json();
                console.log('Stats received:', stats);
                
                updateUI(stats);

                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(fetchData, CONFIG.REFRESH_INTERVAL);
            } catch (error) {
                console.error('Error fetching data:', error);
                showError(`Failed to load staking data: ${error.message}`);
                
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(fetchData, 30000);
            }
        }

        // Initialize
        // SYND Token Tooltip and Bottom Sheet
        let syndPriceData = null;
        let syndTooltipChart = null;
        let syndBottomSheetChart = null;
        let cachedPriceHistory = null; // Cache the generated price history

        async function fetchSyndPrice() {
            try {
                const response = await fetch('/api/price');
                if (!response.ok) throw new Error('Failed to fetch price');
                const data = await response.json();
                return data;
            } catch (error) {
                console.error('Error fetching SYND price:', error);
                return null;
            }
        }

        function createSyndPriceChart(canvasId, priceHistory) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return null;

            // Destroy existing chart if it exists
            if (canvasId === 'syndTooltipChart' && syndTooltipChart) {
                syndTooltipChart.destroy();
            }
            if (canvasId === 'syndBottomSheetChart' && syndBottomSheetChart) {
                syndBottomSheetChart.destroy();
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            // Use real price history from API if available
            let labels, prices;
            if (syndPriceData && syndPriceData.priceHistory && syndPriceData.priceHistory.length > 0) {
                // Use real historical data from API
                const history = syndPriceData.priceHistory;
                console.log('Using price history from API:', history.length, 'points');
                
                // Sort by timestamp to ensure chronological order
                const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
                
                // For hourly data (24 hours), show time labels
                // For daily data, show date labels
                const isHourly = sortedHistory.length <= 24;
                
                labels = sortedHistory.map(item => {
                    const date = new Date(item.timestamp);
                    if (isHourly) {
                        // Show hour:minute for hourly data
                        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
                    } else {
                        // Show date for daily data
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                });
                prices = sortedHistory.map(item => parseFloat(item.price) || 0);
                
                // Calculate price range for proper scaling
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const priceRange = maxPrice - minPrice;
                const midPrice = (minPrice + maxPrice) / 2;
                
                console.log('Chart data:', { 
                    labels: labels.length, 
                    prices: prices.length, 
                    minPrice, 
                    maxPrice, 
                    priceRange,
                    midPrice,
                    prices: prices.slice(0, 5) // First 5 prices for debugging
                });
            } else if (cachedPriceHistory) {
                // Fallback to cached data if API history not available
                labels = cachedPriceHistory.labels;
                prices = cachedPriceHistory.prices;
            } else {
                // Last resort: generate sample data (shouldn't happen if API is working)
                labels = [];
                prices = [];
                const now = Date.now();
                const basePrice = syndPriceData?.price || 0.20;
                
                // Generate simple trend data for last 24 hours
                for (let i = 23; i >= 0; i--) {
                    const date = new Date(now - i * 60 * 60 * 1000);
                    labels.push(date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }));
                    prices.push(basePrice); // Flat line if no real data
                }
                
                // Cache the generated data
                cachedPriceHistory = { labels, prices };
            }

            // Calculate Y-axis min/max to show volatility even if prices are close
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : 1;
            const priceRange = maxPrice - minPrice;
            // If prices are very close (less than 1% variation), expand the range to show movement
            const expandedRange = priceRange < (minPrice * 0.01) ? (minPrice * 0.02) : priceRange;
            const yAxisMin = minPrice - (expandedRange * 0.15); // 15% padding below
            const yAxisMax = maxPrice + (expandedRange * 0.15); // 15% padding above
            
            const isMobile = canvasId === 'syndBottomSheetChart';
            const chartConfig = {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Price',
                        data: prices,
                        borderColor: '#569ACF',
                        backgroundColor: 'rgba(86, 154, 207, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            enabled: isMobile,
                            backgroundColor: '#2A3843',
                            borderColor: '#3A4854',
                            borderWidth: 1,
                            titleColor: '#AFC1CF',
                            bodyColor: '#FFFFFF',
                            padding: 8,
                            callbacks: {
                                label: function(context) {
                                    return `$${context.parsed.y.toFixed(4)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: false,
                            grid: { display: false }
                        },
                        y: {
                            display: false,
                            grid: { display: false },
                            beginAtZero: false,
                            min: yAxisMin,
                            max: yAxisMax
                        }
                    }
                }
            };

            const chart = new Chart(ctx, chartConfig);
            if (canvasId === 'syndTooltipChart') {
                syndTooltipChart = chart;
            } else {
                syndBottomSheetChart = chart;
            }
            return chart;
        }

        function updateSyndTooltip(priceData) {
            if (!priceData) return;

            const priceEl = document.getElementById('syndTooltipPrice');
            const changeEl = document.getElementById('syndTooltipChange');
            
            if (priceEl) {
                priceEl.textContent = `$${priceData.price.toFixed(4)}`;
            }
            
            if (changeEl && priceData.change24h !== null) {
                const change = priceData.change24h;
                const isPositive = change >= 0;
                changeEl.textContent = `${isPositive ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;
                changeEl.style.color = isPositive ? '#7FEAC3' : '#FF7A7A';
            } else if (changeEl) {
                changeEl.textContent = '—';
            }

            // Chart will be created when tooltip is shown
        }

        function updateSyndBottomSheet(priceData) {
            if (!priceData) return;

            const priceEl = document.getElementById('syndBottomSheetPrice');
            const changeEl = document.getElementById('syndBottomSheetChange');
            
            if (priceEl) {
                priceEl.textContent = `$${priceData.price.toFixed(4)}`;
            }
            
            if (changeEl && priceData.change24h !== null) {
                const change = priceData.change24h;
                const isPositive = change >= 0;
                changeEl.textContent = `${isPositive ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;
                changeEl.style.color = isPositive ? '#7FEAC3' : '#FF7A7A';
            }

            createSyndPriceChart('syndBottomSheetChart', null);
        }

        function showSyndTooltip(event) {
            const tooltip = document.getElementById('syndTooltip');
            if (!tooltip) return;

            const rect = event.target.getBoundingClientRect();
            const tooltipWidth = 360;
            let left = rect.left + rect.width / 2 - tooltipWidth / 2;
            
            // Keep tooltip within viewport horizontally
            if (left < 8) left = 8;
            if (left + tooltipWidth > window.innerWidth - 8) {
                left = window.innerWidth - tooltipWidth - 8;
            }
            
            // Position tooltip above if it would go off bottom of screen
            const tooltipHeight = tooltip.offsetHeight || 200; // Estimate if not yet rendered
            let top = rect.bottom + 8;
            if (top + tooltipHeight > window.innerHeight - 8) {
                top = rect.top - tooltipHeight - 8;
            }
            
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            tooltip.classList.add('visible');
            
            // Create chart when tooltip is shown (if price data is available)
            if (syndPriceData) {
                setTimeout(() => {
                    const canvas = document.getElementById('syndTooltipChart');
                    if (canvas) {
                        canvas.style.height = '50px';
                        canvas.style.width = '100%';
                    }
                    createSyndPriceChart('syndTooltipChart', null);
                }, 50);
            }
        }

        function hideSyndTooltip() {
            const tooltip = document.getElementById('syndTooltip');
            if (tooltip) {
                tooltip.classList.remove('visible');
            }
        }

        function showSyndBottomSheet() {
            const overlay = document.getElementById('syndBottomSheetOverlay');
            const sheet = document.getElementById('syndBottomSheet');
            if (overlay && sheet) {
                overlay.classList.add('visible');
                sheet.classList.add('visible');
                sheet.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            }
        }

        function hideSyndBottomSheet() {
            const overlay = document.getElementById('syndBottomSheetOverlay');
            const sheet = document.getElementById('syndBottomSheet');
            if (overlay && sheet) {
                overlay.classList.remove('visible');
                sheet.classList.remove('visible');
                sheet.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
        }

        function setupSyndTooltip() {
            const syndLink = document.getElementById('syndLink');
            if (!syndLink) return;

            // Remove existing listeners to prevent duplicates
            const newLink = syndLink.cloneNode(true);
            syndLink.parentNode.replaceChild(newLink, syndLink);

            // Load price data
            fetchSyndPrice().then(data => {
                if (data) {
                    syndPriceData = data;
                    // Clear cached price history when new real data arrives
                    if (data.priceHistory && data.priceHistory.length > 0) {
                        cachedPriceHistory = null;
                    }
                    updateSyndTooltip(data);
                    updateSyndBottomSheet(data);
                }
            });

            // Desktop: hover for tooltip
            if (window.innerWidth > 768) {
                newLink.addEventListener('mouseenter', (e) => {
                    showSyndTooltip(e);
                });
                newLink.addEventListener('mouseleave', () => {
                    hideSyndTooltip();
                });
            }

            // Mobile: click for bottom sheet
            newLink.addEventListener('click', (e) => {
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    showSyndBottomSheet();
                }
            });

            // Close bottom sheet on overlay click (only add once)
            const overlay = document.getElementById('syndBottomSheetOverlay');
            if (overlay && !overlay.dataset.listenerAdded) {
                overlay.addEventListener('click', () => {
                    hideSyndBottomSheet();
                });
                overlay.dataset.listenerAdded = 'true';
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            console.log('Stadium Terminal initialized');
            // Set initial active state for visualizer nav
            const visualizerBtn = document.getElementById('visualizerNavBtn');
            if (visualizerBtn) {
                visualizerBtn.classList.add('active');
            }
            initMetricTooltips();
            fetchData();
        });

        window.addEventListener('beforeunload', () => {
            clearTimeout(refreshTimer);
            Object.values(charts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') chart.destroy();
            });
        });

        // Handle window resize to switch between mobile/desktop charts
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const isMobile = window.innerWidth <= 768;
                const mobileChartsEl = document.getElementById('mobileCharts');
                
                if (isMobile) {
                    // Show mobile charts, hide desktop overlay
                    if (mobileChartsEl) mobileChartsEl.style.display = 'block';
                    // Destroy desktop charts if they exist
                    if (charts.totalStaked) charts.totalStaked.destroy();
                    if (charts.dailyFlow) charts.dailyFlow.destroy();
                    if (charts.stakerGrowth) charts.stakerGrowth.destroy();
                    charts.totalStaked = null;
                    charts.dailyFlow = null;
                    charts.stakerGrowth = null;
                    // Load mobile charts if data is available
                    if (currentStats) {
                        loadCharts();
                    }
                } else {
                    // Hide mobile charts, show desktop overlay option
                    if (mobileChartsEl) mobileChartsEl.style.display = 'none';
                    // Destroy mobile charts if they exist
                    if (charts.mobileTotalStaked) charts.mobileTotalStaked.destroy();
                    if (charts.mobileDailyFlow) charts.mobileDailyFlow.destroy();
                    if (charts.mobileStakerGrowth) charts.mobileStakerGrowth.destroy();
                    charts.mobileTotalStaked = null;
                    charts.mobileDailyFlow = null;
                    charts.mobileStakerGrowth = null;
                }
                renderVisualizer();
                hideTooltip();
            }, 250);
        });

        // Charts toggle
        function setVisualizerView(view) {
            const visualizerBtn = document.getElementById('visualizerNavBtn');
            const dashboardBtn = document.getElementById('dashboardNavBtn');
            const chartsOverlay = document.getElementById('chartsOverlay');
            
            if (view === 'dashboard') {
                visualizerBtn.classList.remove('active');
                dashboardBtn.classList.add('active');
                chartsOverlay.classList.add('visible');
                loadCharts();
            } else {
                visualizerBtn.classList.add('active');
                dashboardBtn.classList.remove('active');
                chartsOverlay.classList.remove('visible');
            }
        }

        function toggleCharts() {
            const overlay = document.getElementById('chartsOverlay');
            const isVisible = overlay.classList.contains('visible');
            
            if (isVisible) {
                setVisualizerView('visualizer');
            } else {
                setVisualizerView('dashboard');
            }
        }

        // Load charts
        async function loadCharts() {
            const isMobile = window.innerWidth <= 768;
            
            try {
                const response = await fetch('/api/trends');
                if (!response.ok) return;
                
                const data = await response.json();
                const trends = data.trends || [];
                
                if (trends.length === 0) return;
                
                if (isMobile) {
                    // Create mobile charts
                    createMobileCharts(trends);
                } else {
                    // Create desktop charts
                    if (charts.totalStaked) return; // Already loaded
                    createTotalStakedChart(trends);
                    createDailyFlowChart(trends);
                    createStakerGrowthChart(trends);
                }
            } catch (error) {
                console.error('Error loading charts:', error);
            }
        }

        // Create mobile charts (simpler versions)
        function createMobileCharts(trends) {
            // Mobile Total Staked Chart
            const mobileTotalCtx = document.getElementById('mobileTotalStakedChart').getContext('2d');
            if (charts.mobileTotalStaked) charts.mobileTotalStaked.destroy();
            charts.mobileTotalStaked = new Chart(mobileTotalCtx, {
                type: 'line',
                data: {
                    labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                    datasets: [{
                        label: 'Total Staked',
                        data: trends.map(t => t.totalStaked),
                        borderColor: CHART_COLORS.primary,
                        backgroundColor: CHART_COLORS.background,
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'Total Staked Over Time',
                            color: CHART_COLORS.text,
                            font: { family: CHART_COLORS.fontFamily, size: 12, weight: '600' },
                            padding: { bottom: 10 }
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { color: CHART_COLORS.textSecondary, font: { family: CHART_COLORS.fontFamily, size: 10 } },
                            grid: { color: CHART_COLORS.grid }
                        },
                        y: { 
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 10 },
                                callback: v => v >= 1000 ? (v/1000).toFixed(0) + 'K' : v.toFixed(0)
                            },
                            grid: { color: CHART_COLORS.grid }
                        }
                    }
                }
            });

            // Mobile Daily Flow Chart
            const mobileFlowCtx = document.getElementById('mobileDailyFlowChart').getContext('2d');
            if (charts.mobileDailyFlow) charts.mobileDailyFlow.destroy();
            charts.mobileDailyFlow = new Chart(mobileFlowCtx, {
                type: 'bar',
                data: {
                    labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                    datasets: [
                        { label: 'Stakes', data: trends.map(t => t.stakes), backgroundColor: CHART_COLORS.primary },
                        { label: 'Unstakes', data: trends.map(t => -t.unstakes), backgroundColor: CHART_COLORS.secondary }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'Daily Staking Flow',
                            color: CHART_COLORS.text,
                            font: { family: CHART_COLORS.fontFamily, size: 12, weight: '600' },
                            padding: { bottom: 10 }
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { color: CHART_COLORS.textSecondary, font: { family: CHART_COLORS.fontFamily, size: 10 } },
                            grid: { color: CHART_COLORS.grid }
                        },
                        y: { 
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 10 },
                                callback: v => {
                                    const abs = Math.abs(v);
                                    return abs >= 1000 ? (abs/1000).toFixed(0) + 'K' : abs.toFixed(0);
                                }
                            },
                            grid: { color: CHART_COLORS.grid }
                        }
                    }
                }
            });

            // Mobile Staker Growth Chart
            const mobileGrowthCtx = document.getElementById('mobileStakerGrowthChart').getContext('2d');
            if (charts.mobileStakerGrowth) charts.mobileStakerGrowth.destroy();
            charts.mobileStakerGrowth = new Chart(mobileGrowthCtx, {
                type: 'line',
                data: {
                    labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                    datasets: [{
                        label: 'Total Stakers',
                        data: trends.map(t => t.totalStakers),
                        borderColor: CHART_COLORS.secondary,
                        backgroundColor: 'rgba(176, 184, 192, 0.15)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'Staker Growth',
                            color: CHART_COLORS.text,
                            font: { family: CHART_COLORS.fontFamily, size: 12, weight: '600' },
                            padding: { bottom: 10 }
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { color: CHART_COLORS.textSecondary, font: { family: CHART_COLORS.fontFamily, size: 10 } },
                            grid: { color: CHART_COLORS.grid }
                        },
                        y: { 
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 10 },
                                stepSize: 1
                            },
                            grid: { color: CHART_COLORS.grid }
                        }
                    }
                }
            });
        }

        const CHART_COLORS = {
            primary: '#FFFFFF',
            secondary: '#B0B8C0',
            grid: '#3A4854',
            text: '#E2E8F0',
            textSecondary: '#94A3B8',
            background: 'rgba(255, 255, 255, 0.15)',
            fontFamily: "'Geist Mono', 'SF Mono', 'Monaco', 'Courier New', monospace"
        };

        function createTotalStakedChart(trends) {
            const ctx = document.getElementById('totalStakedChart').getContext('2d');
            if (charts.totalStaked) charts.totalStaked.destroy();
            
            charts.totalStaked = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                    datasets: [{
                        label: 'Total Staked (SYND)',
                        data: trends.map(t => t.totalStaked),
                        borderColor: CHART_COLORS.primary,
                        backgroundColor: CHART_COLORS.background,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: CHART_COLORS.primary,
                        pointBorderColor: CHART_COLORS.primary,
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: CHART_COLORS.text,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                usePointStyle: true,
                                padding: 12,
                                boxWidth: 8,
                                boxHeight: 8
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 20, 25, 0.95)',
                            borderColor: CHART_COLORS.primary,
                            borderWidth: 1,
                            titleColor: CHART_COLORS.primary,
                            bodyColor: CHART_COLORS.text,
                            padding: 12,
                            titleFont: { family: CHART_COLORS.fontFamily },
                            bodyFont: { family: CHART_COLORS.fontFamily },
                            callbacks: {
                                label: function(context) {
                                    return `Total: ${formatNumber(context.parsed.y)} SYND`;
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: 'Total Staked Over Time',
                            color: CHART_COLORS.text,
                            font: { family: CHART_COLORS.fontFamily, size: 14, weight: '600' },
                            padding: { bottom: 15 }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 11, weight: '500' },
                                maxRotation: 45,
                                minRotation: 45,
                                padding: 8
                            }, 
                            grid: { 
                                color: CHART_COLORS.grid,
                                drawBorder: false,
                                lineWidth: 1
                            },
                            title: {
                                display: true,
                                text: 'Date',
                                color: CHART_COLORS.text,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                padding: { top: 10 }
                            }
                        },
                        y: { 
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 11, weight: '500' },
                                padding: 8,
                                callback: function(v) {
                                    if (v >= 1000000) return (v/1000000).toFixed(1) + 'M';
                                    if (v >= 1000) return (v/1000).toFixed(0) + 'K';
                                    return v.toFixed(0);
                                }
                            }, 
                            grid: { 
                                color: CHART_COLORS.grid,
                                drawBorder: false,
                                lineWidth: 1
                            },
                            title: {
                                display: true,
                                text: 'SYND Staked',
                                color: CHART_COLORS.text,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                padding: { bottom: 10 }
                            }
                        }
                    }
                }
            });
        }

        function createDailyFlowChart(trends) {
            const ctx = document.getElementById('dailyFlowChart').getContext('2d');
            if (charts.dailyFlow) charts.dailyFlow.destroy();
            
            charts.dailyFlow = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                    datasets: [
                        { 
                            label: 'Stakes', 
                            data: trends.map(t => t.stakes), 
                            backgroundColor: CHART_COLORS.primary,
                            borderColor: CHART_COLORS.primary,
                            borderWidth: 2
                        },
                        { 
                            label: 'Unstakes', 
                            data: trends.map(t => -t.unstakes), 
                            backgroundColor: CHART_COLORS.secondary,
                            borderColor: CHART_COLORS.secondary,
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: CHART_COLORS.text,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                usePointStyle: true,
                                padding: 12,
                                boxWidth: 8,
                                boxHeight: 8
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 20, 25, 0.95)',
                            borderColor: CHART_COLORS.primary,
                            borderWidth: 1,
                            titleColor: CHART_COLORS.primary,
                            bodyColor: CHART_COLORS.text,
                            padding: 12,
                            titleFont: { family: CHART_COLORS.fontFamily },
                            bodyFont: { family: CHART_COLORS.fontFamily },
                            callbacks: {
                                label: function(context) {
                                    const value = Math.abs(context.parsed.y);
                                    const label = context.dataset.label;
                                    return `${label}: ${formatNumber(value)} SYND`;
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: 'Daily Staking Flow',
                            color: CHART_COLORS.text,
                            font: { family: CHART_COLORS.fontFamily, size: 14, weight: '600' },
                            padding: { bottom: 15 }
                        }
                    },
                    scales: {
                        x: {
                            stacked: false,
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 11, weight: '500' },
                                maxRotation: 45,
                                minRotation: 45,
                                padding: 8
                            }, 
                            grid: { 
                                color: CHART_COLORS.grid,
                                drawBorder: false,
                                lineWidth: 1
                            },
                            title: {
                                display: true,
                                text: 'Date',
                                color: CHART_COLORS.text,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                padding: { top: 10 }
                            }
                        },
                        y: {
                            stacked: false,
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { size: 11, weight: '500' },
                                padding: 8,
                                callback: function(v) {
                                    const abs = Math.abs(v);
                                    if (abs >= 1000000) return (abs/1000000).toFixed(1) + 'M';
                                    if (abs >= 1000) return (abs/1000).toFixed(0) + 'K';
                                    return abs.toFixed(0);
                                }
                            }, 
                            grid: { 
                                color: CHART_COLORS.grid,
                                drawBorder: false,
                                lineWidth: 1
                            },
                            title: {
                                display: true,
                                text: 'SYND Amount',
                                color: CHART_COLORS.text,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                padding: { bottom: 10 }
                            },
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        function createStakerGrowthChart(trends) {
            const ctx = document.getElementById('stakerGrowthChart').getContext('2d');
            if (charts.stakerGrowth) charts.stakerGrowth.destroy();
            
            // Calculate net flow for better visualization
            const netFlowData = trends.map(t => t.netFlow || 0);
            const maxNetFlow = Math.max(...netFlowData.map(Math.abs));
            
            charts.stakerGrowth = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                    datasets: [
                        {
                            label: 'Total Stakers',
                            data: trends.map(t => t.totalStakers),
                            borderColor: CHART_COLORS.secondary,
                            backgroundColor: 'rgba(176, 184, 192, 0.15)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: CHART_COLORS.secondary,
                            pointBorderColor: CHART_COLORS.secondary,
                            pointBorderWidth: 2,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Net Flow (Daily)',
                            data: netFlowData,
                            borderColor: CHART_COLORS.primary,
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderWidth: 2,
                            borderDash: [8, 4],
                            fill: false,
                            tension: 0.1,
                            pointRadius: 3,
                            pointHoverRadius: 5,
                            pointBackgroundColor: CHART_COLORS.primary,
                            pointBorderColor: CHART_COLORS.primary,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: CHART_COLORS.text,
                                font: { size: 12, weight: '500' },
                                usePointStyle: true,
                                padding: 12,
                                boxWidth: 8,
                                boxHeight: 8
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 20, 25, 0.95)',
                            borderColor: CHART_COLORS.primary,
                            borderWidth: 1,
                            titleColor: CHART_COLORS.primary,
                            bodyColor: CHART_COLORS.text,
                            padding: 12,
                            titleFont: { family: CHART_COLORS.fontFamily },
                            bodyFont: { family: CHART_COLORS.fontFamily },
                            callbacks: {
                                label: function(context) {
                                    if (context.datasetIndex === 0) {
                                        return `Stakers: ${context.parsed.y}`;
                                    } else {
                                        const value = context.parsed.y;
                                        const sign = value >= 0 ? '+' : '';
                                        return `Net Flow: ${sign}${formatNumber(value)} SYND`;
                                    }
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: 'Staker Growth & Daily Net Flow',
                            color: CHART_COLORS.text,
                            font: { family: CHART_COLORS.fontFamily, size: 14, weight: '600' },
                            padding: { bottom: 15 }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { 
                                color: CHART_COLORS.textSecondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 11, weight: '500' },
                                maxRotation: 45,
                                minRotation: 45,
                                padding: 8
                            }, 
                            grid: { 
                                color: CHART_COLORS.grid,
                                drawBorder: false,
                                lineWidth: 1
                            },
                            title: {
                                display: true,
                                text: 'Date',
                                color: CHART_COLORS.text,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                padding: { top: 10 }
                            }
                        },
                        y: {
                            type: 'linear',
                            position: 'left',
                            ticks: { 
                                color: CHART_COLORS.secondary, 
                                font: { family: CHART_COLORS.fontFamily, size: 11, weight: '500' },
                                padding: 8,
                                stepSize: 1
                            }, 
                            grid: { 
                                color: CHART_COLORS.grid,
                                drawBorder: false,
                                lineWidth: 1
                            },
                            title: {
                                display: true,
                                text: 'Total Stakers',
                                color: CHART_COLORS.secondary,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                padding: { bottom: 10 }
                            }
                        },
                        y1: {
                            type: 'linear',
                            position: 'right',
                            ticks: { 
                                color: CHART_COLORS.primary, 
                                font: { family: CHART_COLORS.fontFamily, size: 11, weight: '500' },
                                padding: 8,
                                callback: function(v) {
                                    if (v >= 1000000) return (v/1000000).toFixed(1) + 'M';
                                    if (v >= 1000) return (v/1000).toFixed(0) + 'K';
                                    return v.toFixed(0);
                                }
                            }, 
                            grid: { 
                                drawOnChartArea: false,
                                drawBorder: false
                            },
                            title: {
                                display: true,
                                text: 'Net Flow (SYND)',
                                color: CHART_COLORS.primary,
                                font: { family: CHART_COLORS.fontFamily, size: 12, weight: '500' },
                                padding: { bottom: 10 }
                            }
                        }
                    }
                }
            });
        }

        // Node details modal
        async function showNodeDetails(address) {
            console.log('showNodeDetails called with:', address);
            if (!address) {
                console.error('No address provided');
                return;
            }
            
            try {
                const modal = document.getElementById('nodeModal');
                const body = document.getElementById('nodeModalBody');
                
                // Show loading state
                body.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading node details...</div>';
                modal.classList.add('visible');
                
                const response = await fetch(`/api/node/${address}`);
                if (!response.ok) {
                    throw new Error(`Node not found: ${response.status}`);
                }
                
                const node = await response.json();
                console.log('Node data received:', node);
                
                const quality = node.quality || { score: 0, activeEpochs: 0, totalEpochs: 0 };
                destroyNodeHistoryChart();
                
                body.innerHTML = `
                    <div class="node-detail-item">
                        <div class="node-detail-label">Address</div>
                        <div class="node-detail-value" style="font-family: monospace; font-size: 12px;">${node.address}</div>
                            <a href="https://commons.explorer.syndicate.io/address/${node.address}" target="_blank" 
                               style="font-size: 10px; color: var(--text-muted); margin-top: 4px; display: block;">
                                View on Explorer →
                            </a>
                        </div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Staked Amount</div>
                        <div class="node-detail-value">${formatNumber(node.amount || 0)} SYND (${(node.percentage || 0).toFixed(2)}%)</div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Node Quality</div>
                        <div class="node-detail-value">
                            <div class="quality-score">
                                <span>${quality.score}/100</span>
                                <div class="quality-bar">
                                    <div class="quality-bar-fill" style="width: ${quality.score}%"></div>
                                </div>
                            </div>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                            Active in ${quality.activeEpochs} of ${quality.totalEpochs} recent epochs
                        </div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Stake Momentum</div>
                        <div class="node-history-trend">
                            <div class="node-history-summary">
                                <div class="net-block">
                                    <span class="context">Net flow (last 20 actions)</span>
                                    <span class="value" id="nodeHistoryNetChange">--</span>
                                    </div>
                                <span class="context" id="nodeHistoryContext">Awaiting recent activity</span>
                        </div>
                            <div class="node-history-chart">
                                <canvas id="nodeHistoryTrendChart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="node-detail-item">
                        <div class="node-detail-label">Staking Timeline (Last 20)</div>
                        <div class="node-history-timeline" id="nodeHistoryTimeline"></div>
                    </div>
                `;

                renderNodeHistoryTrend(node);
                renderNodeHistoryTimeline(node);
            } catch (error) {
                console.error('Error loading node details:', error);
                const body = document.getElementById('nodeModalBody');
                body.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: var(--text-muted);">
                        <div style="margin-bottom: 16px;">Error loading node details</div>
                        <div style="font-size: 11px;">${error.message}</div>
                        <div style="font-size: 10px; margin-top: 8px; color: var(--text-muted);">Address: ${address}</div>
                    </div>
                `;
            }
        }

        function closeNodeModal(event) {
            if (!event || event.target.id === 'nodeModal' || event.target.classList.contains('modal-close')) {
                document.getElementById('nodeModal').classList.remove('visible');
                destroyNodeHistoryChart();
            }
        }

        // Close modal on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeNodeModal();
                closeMetricModal();
                // Also close visualizer on mobile
                if (window.innerWidth <= 768) {
                    const isoContainer = document.querySelector('.iso-container');
                    if (isoContainer.classList.contains('visible')) {
                        toggleVisualizer();
                    }
                }
            }
        });

        // Mobile visualizer toggle
        function toggleVisualizer() {
            const toggle = document.getElementById('visualizerToggle');
            const body = document.body;
            const activating = !body.classList.contains('visualizer-only');

            if (activating) {
                body.classList.add('visualizer-only');
                isoContainer.classList.add('visible');
                toggle.textContent = 'VIEW DASHBOARD';
                renderVisualizer();
            } else {
                body.classList.remove('visualizer-only');
                isoContainer.classList.remove('visible');
                toggle.textContent = 'VIEW VISUALIZER';
                refreshStageIndicator();
            }
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                document.body.classList.remove('visualizer-only');
                isoContainer.classList.remove('visible');
                const toggle = document.getElementById('visualizerToggle');
                if (toggle) {
                    toggle.textContent = 'VIEW VISUALIZER';
            }
            }
            renderVisualizer();
        });
