// ==UserScript==
// @name         Wanikani Leaderboard 2 (2026 Fix)
// @namespace    http://tampermonkey.net/
// @version      3.2.0
// @description  Get levels from usernames and order them in a competitive list
// @author       crazyfluff, faraplay, Dani2
// @include      https://www.wanikani.com/dashboard
// @include      https://www.wanikani.com/
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/551822/Wanikani%20Leaderboard%202%20%282026%20Fix%29.user.js
// @updateURL https://update.greasyfork.org/scripts/551822/Wanikani%20Leaderboard%202%20%282026%20Fix%29.meta.js
// ==/UserScript==

(function () {
    'use strict';

    //------------------------------
    // Wanikani Framework
    //------------------------------
    if (!window.wkof) {
        let response = confirm('WaniKani Leaderboard script requires WaniKani Open Framework.\n Click "OK" to be forwarded to installation instructions.');

        if (response) {
            window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549';
        }

        return;
    }

    wkof.include('Menu,ItemData');
    wkof.ready('Menu').then(install_menu);
    wkof.ready('ItemData').then(loadTotalItemCount);

    //------------------------------
    // Menu
    //------------------------------

    function install_menu() {
        wkof.Menu.insert_script_link({
            script_id: 'Leaderboard',
            name: 'Leaderboard',
            submenu: 'Settings',
            title: 'Leaderboard',
            on_click: open_settings
        });
    }

    //------------------------------
    // Item count
    //------------------------------

    //fetch the live count of non-hidden WK subjects (radicals/kanji/vocabulary) across every
    //level, so burn%/seen% track WK's actual catalog instead of a hardcoded number that goes
    //stale whenever WK adds content. override_max_level bypasses the current user's own
    //subscription cap so the count always covers all 60 levels, not just what they've paid for.
    function loadTotalItemCount() {
        wkof.user.override_max_level = 60;
        wkof.ItemData.get_items().then(function (items) {
            if (items.length > 0) {
                totalNumberOfWKItems = items.length;
                createLeaderboard();
            }
        });
    }

    //------------------------------
    // Settings modal — plain HTML/CSS/JS, no jQuery UI. wkof.Settings (jQuery UI's
    // dialog widget under the hood) fought us on font-family, button styling, and a
    // focus/scroll-jump bug all session; a small hand-built modal sidesteps all of it.
    //------------------------------
    const sortOrderOptions = [
        { value: 'key1', label: 'Level -> Burn% -> Name' },
        { value: 'key2', label: 'Level -> Name' },
        { value: 'key3', label: 'Burn% -> Level -> Name' },
        { value: 'key4', label: 'Burn% -> Name' },
        { value: 'key5', label: 'Name Ascending' },
        { value: 'key6', label: 'Name Descending' },
    ];

    var settingsModalEl;
    var settingsAddUserInput;
    var settingsSortOrderSelect;

    function buildSettingsModal() {
        const overlay = document.createElement('div');
        overlay.className = 'leaderboard-settings-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="leaderboard-settings-modal" role="dialog" aria-modal="true" aria-labelledby="leaderboard-settings-title">
                <div class="leaderboard-settings-header">
                    <h2 id="leaderboard-settings-title">Settings</h2>
                    <button type="button" class="leaderboard-settings-close-btn" aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
                    </button>
                </div>
                <div class="leaderboard-settings-tabs">
                    <button type="button" class="leaderboard-settings-tab is-active" data-tab="addUser">Add User</button>
                    <button type="button" class="leaderboard-settings-tab" data-tab="sortOrder">Sort Order</button>
                </div>
                <div class="leaderboard-settings-panel" data-panel="addUser">
                    <input type="text" class="leaderboard-settings-input" placeholder="Username">
                </div>
                <div class="leaderboard-settings-panel" data-panel="sortOrder" hidden>
                    <select class="leaderboard-settings-select">
                        ${sortOrderOptions.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('')}
                    </select>
                </div>
                <div class="leaderboard-settings-footer">
                    <button type="button" class="leaderboard-settings-save-btn">Save</button>
                    <button type="button" class="leaderboard-settings-cancel-btn">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        settingsAddUserInput = overlay.querySelector('.leaderboard-settings-input');
        settingsSortOrderSelect = overlay.querySelector('.leaderboard-settings-select');

        overlay.querySelectorAll('.leaderboard-settings-tab').forEach(function (tabBtn) {
            tabBtn.addEventListener('click', function () {
                overlay.querySelectorAll('.leaderboard-settings-tab').forEach(function (b) { b.classList.remove('is-active'); });
                tabBtn.classList.add('is-active');
                const targetPanel = tabBtn.dataset.tab;
                overlay.querySelectorAll('.leaderboard-settings-panel').forEach(function (panel) {
                    panel.hidden = panel.dataset.panel !== targetPanel;
                });
            });
        });

        overlay.querySelector('.leaderboard-settings-close-btn').addEventListener('click', closeSettingsModal);
        overlay.querySelector('.leaderboard-settings-cancel-btn').addEventListener('click', closeSettingsModal);
        overlay.querySelector('.leaderboard-settings-save-btn').addEventListener('click', function () {
            const name = settingsAddUserInput.value.trim();
            if (name) { addUser(name); }

            const chosenSortOrder = settingsSortOrderSelect.value;
            if (chosenSortOrder !== userSortingMethod) {
                userSortingMethod = chosenSortOrder;
                saveToCache(CACHE_KEY_SORTING_METHOD, userSortingMethod);
                inference();
            }

            closeSettingsModal();
        });

        //clicking the dimmed backdrop (not the modal itself) closes it, same as Cancel
        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay) { closeSettingsModal(); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !overlay.hidden) { closeSettingsModal(); }
        });

        return overlay;
    }

    function open_settings() {
        if (!settingsModalEl) { settingsModalEl = buildSettingsModal(); }
        settingsAddUserInput.value = '';
        settingsSortOrderSelect.value = userSortingMethod;
        settingsModalEl.hidden = false;
        settingsAddUserInput.focus();
    }

    function closeSettingsModal() {
        //Blur before hiding: a focused element losing its rendering (e.g. via the
        //`hidden` attribute) while it still has focus makes the browser fall back to
        //focusing <body>, which in turn makes Chrome scroll to the top of the page.
        //Moving focus away first, while everything is still visible, avoids that
        //fallback entirely instead of needing to react to it afterward.
        if (document.activeElement && settingsModalEl.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        settingsModalEl.hidden = true;
    }

    //------------------------------
    // Time
    //------------------------------

    var timeSinceLastRefresh = 1539614371504;
    var timeSinceLastRefreshText = '';

    function updateTimeSinceRefreshText() {
        let times = millisecondsToDayHourMinute(Date.now() - timeSinceLastRefresh);
        let daysPassed = times[0] === 1 ? ' day ' : ' days ';
        let hoursPassed = times[1] === 1 ? ' hour ' : ' hours ';
        let minutesPassed = times[2] === 1 ? ' minute ' : ' minutes ';
        timeSinceLastRefreshText = times[0] + daysPassed + times[1] + hoursPassed + times[2] + minutesPassed;
    }

    function millisecondsToDayHourMinute(time) {
        let daysPassed = 24 * 60 * 60 * 1000,
            hoursPassed = 60 * 60 * 1000,
            day = Math.floor(time / daysPassed),
            hour = Math.floor((time - day * daysPassed) / hoursPassed),
            minute = Math.round((time - day * daysPassed - hour * hoursPassed) / 60000);
        if (minute === 60) {
            hour++;
            minute = 0;
        }
        if (hour === 24) {
            day++;
            hour = 0;
        }
        return [day, hour, minute];
    }

    //------------------------------
    // Caching
    //------------------------------

    //userlist
    var usersInfoList = [];
    var userSortingMethod = 'key1';
    var showChartsPanel = false;//whether the charts panel is expanded
    var activeChartTab = 'srsStages';//'srsStages' | 'seenTrend' | 'burnTrend' | 'levelTrend' -- which chart tab is showing
    var trendValueMode = 'percent';//'percent' | 'count' -- burn%/seen% trend charts' %/# switch
    var trendWindowPreset = '1M';//'1M' | '3M' | '6M' | '1Y' | 'All' -- how far back the trend charts show
    //raw per-stage counts, not percentages, are stored -- burn%/seen% are derived at render time
    //against the current totalNumberOfWKItems (see percentOf), so historical points stay consistent
    //with today's catalog size instead of being frozen at whatever total existed when recorded, and
    //"seen" is just the sum of all five stages rather than its own separately-tracked field
    var progressHistory = {};//{ [username]: [{date:'YYYY-MM-DD', level, appr, guru, master, enlight, burn}, ...] }, oldest first

    //date range picked by dragging across a trend chart (see attachLineTrendChartInteractivity);
    //while set, it drives the main table's delta badges instead of "since last refresh". Not
    //persisted to cache -- it's a temporary lens for the current session, cleared by a plain click
    //on a chart or the banner's clear button.
    var selectedDeltaRange = null;//{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } | null

    //cache keys, namespaced under wkof.settings.* so wkof's file_cache never sweeps them for
    //inactivity -- its cleanup only exempts keys matching that prefix (see file_cache_cleanup in
    //wkof's Core.js), and everything else gets purged after 14 days without a page load
    const CACHE_KEY_USER_LIST = 'wkof.settings.leaderboard_userList';
    const CACHE_KEY_SORTING_METHOD = 'wkof.settings.leaderboard_sortingMethod';
    const CACHE_KEY_HISTORY = 'wkof.settings.leaderboard_history';
    const CACHE_KEY_CHARTS_OPEN = 'wkof.settings.leaderboard_chartsOpen';
    const CACHE_KEY_ACTIVE_CHART_TAB = 'wkof.settings.leaderboard_activeChartTab';
    const CACHE_KEY_TIME_SINCE_LAST_REFRESH = 'wkof.settings.leaderboard_timeSinceLastRefresh';
    const CACHE_KEY_TREND_VALUE_MODE = 'wkof.settings.leaderboard_trendValueMode';
    const CACHE_KEY_TREND_WINDOW_PRESET = 'wkof.settings.leaderboard_trendWindowPreset';

    //generic cache helpers used for every simple setting below
    function saveToCache(key, value) {
        wkof.file_cache.save(key, value);
    }

    function loadFromCache(key, fallback) {
        return wkof.file_cache.load(key).catch(function () { return fallback; });
    }

    //today's date as a local YYYY-MM-DD key (not toISOString, which is UTC and can
    //land on the wrong side of midnight for the user's actual calendar day)
    function todayDateKey() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${now.getFullYear()}-${month}-${day}`;
    }

    //records one snapshot per user per calendar day (refreshing multiple times in
    //the same day overwrites that day's entry rather than adding duplicates), so
    //the trend chart has something to plot without needing a separate history file.
    //Skipped for users a fetch couldn't find, so a bad lookup doesn't pollute the trend.
    function recordProgressHistory() {
        const dateKey = todayDateKey();
        usersInfoList.forEach(function (user) {
            if (!user.wasUserFound) { return; }
            const entries = progressHistory[user.name] || (progressHistory[user.name] = []);
            const dist = user.srs_distribution[0] || {};
            const snapshot = { date: dateKey, level: user.level };
            srsStages.forEach(function (stage) { snapshot[stage.key] = dist[stage.key + 'Total'] || 0; });
            const lastEntry = entries[entries.length - 1];
            if (lastEntry && lastEntry.date === dateKey) {
                entries[entries.length - 1] = snapshot;
            } else {
                entries.push(snapshot);
            }
        });
        saveToCache(CACHE_KEY_HISTORY, progressHistory);
    }

    //refresh time
    function getTimeSinceLastRefreshFromCache() {
        return new Promise((resolve) => {
            wkof.file_cache.load(CACHE_KEY_TIME_SINCE_LAST_REFRESH).then(function (settings) {
                resolve(settings);
            }).catch(e => {
                wkof.file_cache.save(CACHE_KEY_TIME_SINCE_LAST_REFRESH, Date.now()).then(function () {
                }).catch(e => {
                    console.log(e);
                });
                timeSinceLastRefreshText = '0 days 0 hours 0 minutes';
                resolve(Date.now());
            });
        });
    }

    function refreshDashboard() {
        wkof.file_cache.save(CACHE_KEY_TIME_SINCE_LAST_REFRESH, Date.now()).then(function () {
        }).catch(e => {
            console.log(e);
        });

        timeSinceLastRefreshText = '0 days 0 hours 0 minutes';
        processArray();
    }

    //------------------------------
    // Global variables
    //------------------------------
    const wkRealms = ['快', '苦', '死', '地獄', '天国', '現実', '?'];
    const wkRealmNames = ['Pleasant', 'Painful', 'Death', 'Hell', 'Paradise', 'Reality', 'Error'];
    const leaderboardColors = ['none', 'apprColor', 'guruColor', 'masterColor', 'enlightenedColor', 'burnedColor', 'errorColor'];

    //SRS stages shown in the stage-comparison chart, in pipeline order
    const srsStages = [
        { key: 'appr', label: 'Apprentice', colorClass: 'apprColor' },
        { key: 'guru', label: 'Guru', colorClass: 'guruColor' },
        { key: 'master', label: 'Master', colorClass: 'masterColor' },
        { key: 'enlight', label: 'Enlightened', colorClass: 'enlightenedColor' },
        { key: 'burn', label: 'Burned', colorClass: 'burnedColor' },
    ];

    //validated categorical palette (blue/orange/aqua/yellow/magenta/green/violet/red) for the
    //burn% trend chart, one color per user. Fixed order, assigned by username (not sort
    //position) so a user's color never changes when the board re-sorts. A 9th user is never
    //given a generated hue -- the trend chart simply caps at these 8.
    const trendChartPalette = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

    //how far back each trend-window preset reaches; 'All' has no cutoff
    const TREND_WINDOW_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'All': Infinity };

    const accountNotFoundMessage = ' (Not Found)';

    //total number of WaniKani items (radicals + kanji + vocabulary). Refined via wkof.ItemData
    //once it loads (see loadTotalItemCount) so this tracks WK's real catalog instead of going
    //stale whenever WK adds content; this fallback only covers the brief window before that
    //resolves, or if it fails.
    let totalNumberOfWKItems = 8910;

    var usersThatLeveledUp = '';

    //------------------------------
    // Get user information (name, level, avatar, realm)
    //------------------------------

    //determine what realm (pleasant, painful, etc.) a user is in
    function setRealm(userLevel) {
        switch (Math.ceil(userLevel / 10) * 10) {
            case 70:
                return 5;//reality+
            case 60:
                return 5;//reality
            case 50:
                return 4;//heaven
            case 40:
                return 3;//hell
            case 30:
                return 2;//death
            case 20:
                return 1;//painful
            case 10:
                return 0;//pleasant
            default:
                return 6;//error
        }
    }

    async function checkIfUserAlreadyOnLeaderboard(name = '') {
        await delay();
        for (var i = 0; i < usersInfoList.length; i++) {
            if (usersInfoList[i].name.toLowerCase() === name.toLowerCase() || usersInfoList[i].name.toLowerCase() === name + accountNotFoundMessage.toLowerCase()) {
                return false;
            }
        }
        return true;
    }

    //------------------------------
    // Notification modal — plain HTML/CSS/JS, replacing the SweetAlert dependency
    // (which rendered with its own default, unthemed look, same problem the jQuery
    // UI settings dialog had).
    //------------------------------
    var alertModalEl;
    var alertTitleEl;
    var alertMessageEl;
    var alertOkBtn;

    function buildAlertModal() {
        const overlay = document.createElement('div');
        overlay.className = 'leaderboard-alert-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="leaderboard-alert-modal" role="alertdialog" aria-modal="true">
                <div class="leaderboard-alert-title" hidden></div>
                <div class="leaderboard-alert-message"></div>
                <div class="leaderboard-alert-footer">
                    <button type="button" class="leaderboard-alert-ok-btn">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        alertTitleEl = overlay.querySelector('.leaderboard-alert-title');
        alertMessageEl = overlay.querySelector('.leaderboard-alert-message');
        alertOkBtn = overlay.querySelector('.leaderboard-alert-ok-btn');

        alertOkBtn.addEventListener('click', closeAlertModal);
        //clicking the dimmed backdrop (not the modal itself) dismisses it, same as OK
        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay) { closeAlertModal(); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !overlay.hidden) { closeAlertModal(); }
        });

        return overlay;
    }

    function closeAlertModal() {
        //Blur before hiding: see the matching comment in closeSettingsModal() — this
        //avoids Chrome falling back to focusing <body> and scrolling to the page top.
        if (document.activeElement && alertModalEl.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        alertModalEl.hidden = true;
    }

    //shows a small modal message. Pass just a message, or a title plus a longer detail
    //(e.g. a list of usernames) — replaces the old SweetAlert-based notify().
    function notify(title, detail) {
        if (!alertModalEl) { alertModalEl = buildAlertModal(); }
        const hasDetail = detail !== undefined;
        alertTitleEl.textContent = hasDetail ? title : '';
        alertTitleEl.hidden = !hasDetail;
        alertMessageEl.textContent = hasDetail ? detail : title;
        alertModalEl.hidden = false;
        alertOkBtn.focus();
    }

    //default fields for a user that hasn't been fetched from their WK profile yet
    function createDefaultUserObj(name) {
        return {
            name: name,
            level: 0,
            avatar_link: defaultAvatarUrl,
            realm_number: 6,
            srs_distribution: [{}],
            hasLeveledUp: false,
            wasUserFound: false,
            totalBurnPercentage: 0,
            levelDelta: null,
            burnDelta: null,
            srsTotalDelta: null,
        };
    }

    //add a single user
    async function addUser(name = '') {
        name = name.toLowerCase().split(' ').join('');
        checkIfUserAlreadyOnLeaderboard(name).then(
            async function (result) {
                if (result) {
                    const user = createDefaultUserObj(name);
                    await assignLevelAndAvatarFromWkProfile(user);
                    usersInfoList.push(user);
                    recordProgressHistory();
                    inference();
                } else {
                    notify('A user with that name already exists in the list.');
                }
            });
    }

    //delete a single user
    function deleteUser(name = '') {
        name = name.currentTarget.className.split(" ")[0];//get username from classnames
        for (var i = usersInfoList.length - 1; i >= 0; i--) {
            if (usersInfoList[i].name.split(accountNotFoundMessage).join('') === name) {
                usersInfoList.splice(i, 1);
            }
        }
        saveToCache(CACHE_KEY_USER_LIST, usersInfoList);

        //if list empty reset refresh time to zero
        if (usersInfoList.length === 0) {
            wkof.file_cache.delete(/^wkof\.settings\.leaderboard_/);
            refreshDashboard();
        };

        createLeaderboard();
    }

    //building blocks for the sort keys below; each comparator falls through to the next on a tie
    function chainComparators(...comparators) {
        return function (a, b) {
            for (const compare of comparators) {
                const result = compare(a, b);
                if (result !== 0) { return result; }
            }
            return 0;
        };
    }
    const compareByLevelDesc = (a, b) => b.level - a.level;
    const compareByBurnDesc = (a, b) => b.totalBurnPercentage - a.totalBurnPercentage;
    const compareByNameAsc = (a, b) => a.name.localeCompare(b.name, 'en');
    const compareByNameDesc = (a, b) => b.name.localeCompare(a.name, 'en');

    const sortComparators = {
        key1: chainComparators(compareByLevelDesc, compareByBurnDesc, compareByNameAsc), //lv->burn->name
        key2: chainComparators(compareByLevelDesc, compareByNameAsc), //lv->name
        key3: chainComparators(compareByBurnDesc, compareByLevelDesc, compareByNameAsc), //burn->lv->name
        key4: chainComparators(compareByBurnDesc, compareByNameAsc), //burn->name
        key5: compareByNameAsc, //name ascending
        key6: compareByNameDesc, //name descending
    };

    //for sorting and saving userlist to cache
    function inference() {
        usersInfoList.sort(sortComparators[userSortingMethod]);
        saveToCache(CACHE_KEY_USER_LIST, usersInfoList);//save sorting result and any added users
        createLeaderboard();//renew html
    }

    //throttle the requests a little
    function delay() {
        return new Promise(resolve => setTimeout(resolve, 250));
    }

    //get level, avatar, name and SRS stats from wk profile
    const defaultAvatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=300';

    async function assignLevelAndAvatarFromWkProfile(item) {
        await delay();

        //snapshot of the last refresh, so we can show "change since last refresh" badges below
        const previousLevel = item.level;
        const previousBurnPercentage = item.totalBurnPercentage;
        const previousSrsTotal = srsStageTotal(item);
        const hadPriorData = item.wasUserFound;

        let xmlhttp;
        let userLevel = 0;
        let userAvatarUrl = '';
        let srsCountsLabeled = [];
        let hasUserLeveledUp = false;
        let userFound = false;

        if (window.XMLHttpRequest) {// code for IE7+, Firefox, Chrome, Opera, Safari
            xmlhttp = new XMLHttpRequest();

            xmlhttp.onreadystatechange = function () {
                if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(xmlhttp.responseText, 'text/html');

                    //a nonexistent username redirects to the dashboard, so the parsed title won't
                    //start with the profile prefix (or the trailing name won't match) in that case
                    const profileTitlePrefix = 'WaniKani / Profile / ';
                    const pageUserName = doc.title.startsWith(profileTitlePrefix)
                        ? doc.title.slice(profileTitlePrefix.length)
                        : '';

                    if (pageUserName.toLowerCase() === item.name.toLowerCase()) {
                        const levelEl = doc.querySelector('.public-profile__level-info-level');
                        const levelMatch = levelEl ? levelEl.textContent.match(/\d+/) : null;
                        if (!levelMatch) {
                            console.error('Could not find level for user ' + item.name);
                        }
                        userLevel = levelMatch ? Number(levelMatch[0]) : 0;

                        const avatarEl = doc.querySelector('.public-profile__avatar wk-profile-image');
                        if (!avatarEl) {
                            console.error('Could not find avatar for user ' + item.name);
                        }
                        userAvatarUrl = avatarEl ? avatarEl.getAttribute('src') : defaultAvatarUrl;

                        //check to see if user is already on the leaderboards
                        let found = usersInfoList.find(function (element) {
                            return element.name === pageUserName.toLowerCase();
                        });
                        if (found !== undefined) {
                            //check to see if user has leveled up, so we can display that later
                            if (found.level < userLevel && found.level != 0) {
                                usersThatLeveledUp += found.name + ' ' + found.level + ' -> ' + userLevel + ', \n';
                                hasUserLeveledUp = true;
                            }
                        }

                        userFound = true;
                    } else { //a wanikani profile page didn't exist for this username and we got redirected to dashboard
                        userLevel = -1;
                        userAvatarUrl = defaultAvatarUrl;
                        userFound = false;
                    }

                    // Find all item spread table rows
                    const rows = doc.querySelectorAll('.item-spread-table-row');

                    const obj = {};
                    const srsPrefixes = ['appr', 'guru', 'master', 'enlight', 'burn'];

                    rows.forEach((row, index) => {
                        if (index >= srsPrefixes.length) return;

                        const counts = row.querySelectorAll('.item-spread-table-row__count');
                        const total = row.querySelector('.item-spread-table-row__total');

                        if (counts.length >= 3) {
                            const prefix = srsPrefixes[index];
                            obj[prefix + 'Rad'] = parseInt(counts[0].textContent.trim()) || 0;
                            obj[prefix + 'Kan'] = parseInt(counts[1].textContent.trim()) || 0;
                            obj[prefix + 'Voc'] = parseInt(counts[2].textContent.trim()) || 0;
                            obj[prefix + 'Total'] = parseInt(total?.textContent.trim()) || 0;
                        }
                    });

                    srsCountsLabeled.push(obj);
                }
            }
            xmlhttp.open("GET", '/users/' + item.name, false);
            xmlhttp.send();
        }

        item.level = userLevel;//assign level
        item.avatar_link = userAvatarUrl;//assign avatar url
        item.realm_number = setRealm(item.level);//assign realm
        item.srs_distribution = srsCountsLabeled;//assign SRS stats
        item.hasLeveledUp = hasUserLeveledUp;//whether or not user leveled up since last refresh
        item.wasUserFound = userFound;//whether the user name yielded result in the past (is used to detect name changes or deletion of account)
        item.totalBurnPercentage = percentOf(srsCountsLabeled[0].burnTotal, totalNumberOfWKItems);

        //change since the last refresh, shown as small delta badges (null hides the badge, e.g. on first fetch)
        item.levelDelta = (hadPriorData && userFound) ? (userLevel - Number(previousLevel)) : null;
        item.burnDelta = (hadPriorData && userFound) ? Math.round((item.totalBurnPercentage - previousBurnPercentage) * 100) / 100 : null;
        item.srsTotalDelta = (hadPriorData && userFound) ? (srsStageTotal(item) - previousSrsTotal) : null;
    }

    function showLevelUps() {
        if (usersThatLeveledUp != '') {
            usersThatLeveledUp = usersThatLeveledUp.substring(0, usersThatLeveledUp.length - 3);//remove the ', '

            notify('The following user(s) leveled up:', usersThatLeveledUp);
            usersThatLeveledUp = '';
        }
    }

    async function processArray() {
        const loaderElements = document.querySelectorAll('.leaderboard_loader');
        loaderElements.forEach(el => el.style.display = 'inline-block');

        const leaderboardSpans = document.querySelectorAll('.leaderboardSpan');
        leaderboardSpans.forEach(el => el.classList.add('blurry-text'));

        //process array in parallel
        const promises = usersInfoList.map(assignLevelAndAvatarFromWkProfile);//refresh all
        await Promise.all(promises);

        recordProgressHistory();
        showLevelUps();
        inference();
    }

    function startup() {
        getTimeSinceLastRefreshFromCache().then(function (result) {
            timeSinceLastRefresh = result;
            updateTimeSinceRefreshText();
            createLeaderboard();
        });

        loadFromCache(CACHE_KEY_SORTING_METHOD, 'key1').then(function (result) {
            userSortingMethod = result;
        });

        loadFromCache(CACHE_KEY_HISTORY, {}).then(function (result) {
            progressHistory = result || {};
        });

        loadFromCache(CACHE_KEY_CHARTS_OPEN, false).then(function (result) {
            showChartsPanel = result;
            createLeaderboard();
        });

        loadFromCache(CACHE_KEY_ACTIVE_CHART_TAB, 'srsStages').then(function (result) {
            activeChartTab = result;
            createLeaderboard();
        });

        loadFromCache(CACHE_KEY_TREND_VALUE_MODE, 'percent').then(function (result) {
            trendValueMode = result;
            createLeaderboard();
        });

        loadFromCache(CACHE_KEY_TREND_WINDOW_PRESET, '1M').then(function (result) {
            trendWindowPreset = result;
            createLeaderboard();
        });

        loadFromCache(CACHE_KEY_USER_LIST, undefined).then(function (result) {
            if (result != undefined) {
                usersInfoList = result;
                createLeaderboard();
            } else { //rebuilt anew
                processArray();
            }
        });
    }

    //------------------------------
    // Styling
    //------------------------------

    const leaderboardTableCss = `
        /* ============================================================
           Leaderboard 2 — layout & theme
           ============================================================ */

        /* :root (not #leaderboard) so the settings dialog below — a separate top-level
           element, not a descendant of #leaderboard — can use these variables too. */
        :root {
            --lb-border: rgba(127, 127, 127, 0.18);
            --lb-hover: rgba(127, 127, 127, 0.1);
            --lb-muted: rgba(127, 127, 127, 0.65);
            --lb-track: rgba(127, 127, 127, 0.16);
            --lb-accent: #7a4bda;
        }

        /* Neutralize WK's own .community-banner-widget sizing (max-width/centering meant for
           narrower widgets) since we reuse that class purely for its theme colors, then match
           the flat-bordered, shadowless look every other dashboard card actually uses.
           Fixed white/light border rather than following the OS's prefers-color-scheme: WK's
           own dashboard has no dark theme to react to, it's always rendered light. */
        #leaderboard .leaderboard-widget {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid rgb(202, 208, 214);
            box-shadow: none !important;
            background: #fff !important;
        }

        #leaderboard .leaderboard-table-card,
        #leaderboard table {
            width: 100%;
            max-width: none;
        }

        /* ---- Header / toolbar ---- */

        #leaderboard .leaderboard-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 16px;
        }

        /* WK's own .small-caps class actually renders at 16px/weight 350 here, not the
           18px/700 bold every other card title uses (confirmed via computed styles, not
           assumed) -- so unlike most of this stylesheet, we can't just inherit it. */
        #leaderboard h3.small-caps {
            margin: 0 !important;
            font-size: 18px !important;
            font-weight: 700 !important;
            color: #333 !important;
        }

        #leaderboard .leaderboard-toolbar {
            display: flex;
            align-items: center;
            gap: 2px;
        }

        #leaderboard .leaderboard-icon-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            color: inherit;
            opacity: 0.7;
            cursor: pointer;
            transition: background-color 0.15s ease, opacity 0.15s ease, transform 0.1s ease;
        }

        #leaderboard .leaderboard-icon-btn svg {
            width: 18px;
            height: 18px;
            pointer-events: none;
        }

        #leaderboard .leaderboard-icon-btn:hover {
            opacity: 1;
            background: var(--lb-hover);
        }

        #leaderboard .leaderboard-icon-btn:active {
            transform: scale(0.9);
        }

        #leaderboard .leaderboard-refresh:active svg {
            animation: leaderboard-spin 0.5s ease;
        }

        #leaderboard .leaderboard-charts-toggle.is-active {
            opacity: 1;
            color: var(--lb-accent);
            background: rgba(122, 75, 218, 0.12);
        }

        #leaderboard_loader {
            display: none;
            width: 18px;
            height: 18px;
            margin: 0 4px;
            border: 3px solid var(--lb-track);
            border-top-color: var(--lb-accent);
            border-radius: 50%;
            animation: leaderboard-spin 0.8s linear infinite;
        }

        @keyframes leaderboard-spin {
            to { transform: rotate(360deg); }
        }

        /* File import input (hidden, triggered via label) */
        #leaderboard-files-import {
            position: absolute;
            width: 1px;
            height: 1px;
            margin: -1px;
            padding: 0;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        /* ---- Table ---- */

        #leaderboard table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.92em;
        }

        #leaderboard thead th {
            padding: 4px 10px 8px;
            font-size: 0.7em;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            text-align: left;
            opacity: 0.5;
            border-bottom: 1px solid var(--lb-border);
        }

        #leaderboard th.leaderboard-col-rank,
        #leaderboard th.leaderboard-col-actions {
            text-align: center;
        }

        #leaderboard tbody tr {
            border-top: 1px solid var(--lb-border);
            transition: background-color 0.15s ease;
        }

        #leaderboard tbody tr:hover {
            background: var(--lb-hover);
        }

        #leaderboard tbody td {
            padding: 6px 10px;
            vertical-align: middle;
        }

        /* Rank + realm */
        #leaderboard td.leaderboard-col-rank {
            width: 52px;
            text-align: center;
        }

        #leaderboard .leaderboard-rank-num {
            display: block;
            font-size: 0.8em;
            font-weight: 700;
            opacity: 0.45;
        }

        #leaderboard .leaderboard-realm-badge {
            display: inline-block;
            margin-top: 2px;
            padding: 2px 6px;
            border-radius: 6px;
            font-size: 0.82em;
            line-height: 1.3;
            background: var(--lb-hover);
        }

        /* Avatar */
        #leaderboard td.leaderboard-userImg {
            width: 40px;
        }

        #leaderboard td.leaderboard-userImg img {
            display: block;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            object-fit: cover;
            box-shadow: 0 0 0 2px var(--lb-border);
        }

        /* Username / level / badges */
        #leaderboard .leaderboard-user-link {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            color: inherit;
            text-decoration: none;
            font-weight: 600;
        }

        /* Underline only the name text on hover, not the level/delta/you badges sharing the link */
        #leaderboard .leaderboard-user-link:hover .leaderboard-user-name {
            text-decoration: underline;
        }

        #leaderboard .leaderboard-user-name {
            flex: 0 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #leaderboard .leaderboard-level-badge {
            flex: none;
            padding: 2px 7px;
            border-radius: 999px;
            font-size: 0.75em;
            font-weight: 700;
            background: var(--lb-hover);
            opacity: 0.9;
        }

        #leaderboard .leaderboard-achievement-icon {
            flex: none;
            width: 15px;
            height: 15px;
            color: #f0a500;
        }

        /* Change-since-last-refresh badges */
        #leaderboard .leaderboard-delta {
            flex: none;
            font-size: 0.72em;
            font-weight: 700;
        }

        #leaderboard .leaderboard-delta--up {
            color: #1a8a3d;
        }

        #leaderboard .leaderboard-delta--down {
            color: #c62828;
        }

        /* Seen (any SRS stage) count */
        #leaderboard td.leaderboard-col-seen {
            width: 128px;
        }

        #leaderboard .leaderboard-seen-track {
            position: relative;
            height: 6px;
            margin-bottom: 3px;
            border-radius: 999px;
            background: var(--lb-track);
            overflow: hidden;
        }

        #leaderboard .leaderboard-seen-fill {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            border-radius: 999px;
            background: linear-gradient(90deg, #7a4bda, #a688e8);
        }

        #leaderboard .leaderboard-seen-value {
            font-size: 0.72em;
            opacity: 0.55;
        }

        #leaderboard .leaderboard-col-seen .leaderboard-delta {
            margin-left: 4px;
        }

        /* Burn progress */
        #leaderboard td.leaderboard-col-burn {
            width: 128px;
        }

        #leaderboard .leaderboard-burn-track {
            position: relative;
            height: 6px;
            margin-bottom: 3px;
            border-radius: 999px;
            background: var(--lb-track);
            overflow: hidden;
        }

        #leaderboard .leaderboard-burn-fill {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            border-radius: 999px;
            background: linear-gradient(90deg, #faac05, #fbc550);
        }

        #leaderboard .leaderboard-burn-label {
            font-size: 0.72em;
            opacity: 0.55;
        }

        #leaderboard .leaderboard-col-burn .leaderboard-delta {
            margin-left: 4px;
        }

        /* Delete action */
        #leaderboard td.leaderboard-col-actions {
            width: 34px;
            text-align: center;
        }

        #leaderboard .leaderboard-delete-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            color: #c62828;
            opacity: 0;
            cursor: pointer;
            transition: opacity 0.15s ease, background-color 0.15s ease;
        }

        #leaderboard tbody tr:hover .leaderboard-delete-btn {
            opacity: 0.6;
        }

        #leaderboard .leaderboard-delete-btn:hover {
            opacity: 1 !important;
            background: rgba(198, 40, 40, 0.14);
        }

        #leaderboard .leaderboard-delete-btn svg {
            width: 14px;
            height: 14px;
            pointer-events: none;
        }

        /* Realm badge colors (flat, used only on the small rank badge; "none" / Pleasant realm keeps the neutral default above) */
        #leaderboard .leaderboard-realm-badge.apprColor { background: #dd0093; color: #fff; }
        #leaderboard .leaderboard-realm-badge.guruColor { background: #9300dd; color: #fff; }
        #leaderboard .leaderboard-realm-badge.masterColor { background: #2545C3; color: #fff; }
        #leaderboard .leaderboard-realm-badge.enlightenedColor { background: #0093dd; color: #fff; }
        #leaderboard .leaderboard-realm-badge.burnedColor { background: #faac05; color: #3a2a00; }
        #leaderboard .leaderboard-realm-badge.errorColor { background: #8b0000; color: #fff; }

        /* Same 5 SRS-stage colors, reused for the stage-comparison chart's bar segments
           and legend swatches (kept separate from the realm-badge rules above since they
           apply to different elements). */
        #leaderboard .leaderboard-srs-segment.apprColor,
        #leaderboard .leaderboard-srs-legend-swatch.apprColor { background: #dd0093; }
        #leaderboard .leaderboard-srs-segment.guruColor,
        #leaderboard .leaderboard-srs-legend-swatch.guruColor { background: #9300dd; }
        #leaderboard .leaderboard-srs-segment.masterColor,
        #leaderboard .leaderboard-srs-legend-swatch.masterColor { background: #2545C3; }
        #leaderboard .leaderboard-srs-segment.enlightenedColor,
        #leaderboard .leaderboard-srs-legend-swatch.enlightenedColor { background: #0093dd; }
        #leaderboard .leaderboard-srs-segment.burnedColor,
        #leaderboard .leaderboard-srs-legend-swatch.burnedColor { background: #faac05; }

        /* Empty state */
        #leaderboard .leaderboard-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 30px 16px;
            text-align: center;
            opacity: 0.8;
        }

        #leaderboard .leaderboard-empty svg {
            width: 32px;
            height: 32px;
            opacity: 0.4;
        }

        #leaderboard .leaderboard-empty-add-btn {
            border: none;
            padding: 8px 18px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.9em;
            color: #fff;
            background: var(--lb-accent);
            cursor: pointer;
            transition: background-color 0.15s ease;
        }

        #leaderboard .leaderboard-empty-add-btn:hover {
            background: #6a3bd0;
        }

        /* Charts panel: the toggleable container for both chart tabs below the table */
        #leaderboard .leaderboard-charts-panel {
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid var(--lb-border);
        }

        #leaderboard .leaderboard-chart-tabs {
            display: flex;
            gap: 16px;
            margin-bottom: 14px;
        }

        #leaderboard .leaderboard-chart-tab {
            padding: 0 0 6px;
            border: none;
            border-bottom: 2px solid transparent;
            background: transparent;
            color: rgba(51, 51, 51, 0.6);
            font-family: inherit;
            font-weight: 600;
            font-size: 0.8em;
            cursor: pointer;
            transition: color 0.15s ease, border-color 0.15s ease;
        }

        #leaderboard .leaderboard-chart-tab:hover {
            color: #333;
        }

        #leaderboard .leaderboard-chart-tab.is-active {
            color: var(--lb-accent);
            border-bottom-color: var(--lb-accent);
        }

        /* SRS stage comparison chart */
        #leaderboard .leaderboard-srs-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 12px;
        }

        #leaderboard .leaderboard-srs-legend-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 0.75em;
            opacity: 0.7;
        }

        #leaderboard .leaderboard-srs-legend-swatch {
            width: 9px;
            height: 9px;
            border-radius: 2px;
        }

        #leaderboard .leaderboard-srs-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 5px 0;
        }

        #leaderboard .leaderboard-srs-row-name {
            flex: 0 0 100px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 0.85em;
            font-weight: 600;
        }

        #leaderboard .leaderboard-srs-row-bar-track {
            flex: 1;
            min-width: 0;
        }

        #leaderboard .leaderboard-srs-row-bar {
            display: flex;
            height: 14px;
            border-radius: 4px;
            overflow: hidden;
            background: var(--lb-track);
            transition: width 0.2s ease;
        }

        #leaderboard .leaderboard-srs-segment {
            height: 100%;
        }

        #leaderboard .leaderboard-srs-row-total {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 4px;
            flex: 0 0 auto;
            min-width: 40px;
        }

        #leaderboard .leaderboard-srs-row-total-value {
            font-size: 0.78em;
            opacity: 0.55;
        }

        /* Burn% trend chart */
        #leaderboard .leaderboard-chart-empty {
            padding: 20px 4px;
            font-size: 0.85em;
            opacity: 0.6;
            text-align: center;
        }

        #leaderboard .leaderboard-chart-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }

        #leaderboard .leaderboard-chart-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        #leaderboard .leaderboard-chart-mode-switch {
            position: relative;
            display: inline-flex;
            align-items: center;
            flex: none;
            width: 46px;
            height: 22px;
            padding: 0;
            border: none;
            border-radius: 999px;
            background: var(--lb-track);
            cursor: pointer;
            transition: background 0.2s ease;
        }

        #leaderboard .leaderboard-chart-mode-switch:hover {
            background: var(--lb-hover);
        }

        #leaderboard .leaderboard-chart-mode-switch.is-count {
            background: var(--lb-accent);
        }

        #leaderboard .leaderboard-chart-mode-switch.is-count:hover {
            background: var(--lb-accent);
            opacity: 0.9;
        }

        #leaderboard .leaderboard-chart-mode-switch:active {
            transform: scale(0.96);
        }

        #leaderboard .leaderboard-chart-mode-switch-thumb {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 18px;
            border-radius: 9px;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
            transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        #leaderboard .leaderboard-chart-mode-switch.is-count .leaderboard-chart-mode-switch-thumb {
            transform: translateX(22px);
        }

        #leaderboard .leaderboard-chart-mode-switch-label {
            position: relative;
            z-index: 1;
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--lb-muted);
            transition: color 0.2s ease;
        }

        #leaderboard .leaderboard-chart-mode-switch-label svg {
            width: 11px;
            height: 11px;
        }

        #leaderboard .leaderboard-chart-mode-switch:not(.is-count) .leaderboard-chart-mode-switch-label--percent,
        #leaderboard .leaderboard-chart-mode-switch.is-count .leaderboard-chart-mode-switch-label--count {
            color: var(--lb-accent);
        }

        #leaderboard .leaderboard-chart-mode-switch.is-count .leaderboard-chart-mode-switch-label--percent {
            color: rgba(255, 255, 255, 0.85);
        }

        #leaderboard .leaderboard-chart-range-toggle {
            display: inline-flex;
            border: 0.5px solid var(--lb-border);
            border-radius: 999px;
            padding: 2px;
            gap: 2px;
            margin-bottom: 10px;
        }

        #leaderboard .leaderboard-chart-range-btn {
            border: none;
            background: transparent;
            padding: 3px 9px;
            border-radius: 999px;
            font-size: 0.68em;
            font-weight: 600;
            color: var(--lb-muted);
            cursor: pointer;
        }

        #leaderboard .leaderboard-chart-range-btn.is-active {
            background: var(--lb-accent);
            color: #fff;
        }

        #leaderboard .leaderboard-chart-legend-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 0.75em;
            opacity: 0.7;
        }

        #leaderboard .leaderboard-chart-legend-swatch {
            width: 10px;
            height: 2px;
            border-radius: 1px;
        }

        #leaderboard .leaderboard-chart-svg-wrap {
            position: relative;
        }

        #leaderboard .leaderboard-chart-canvas {
            display: block;
            width: 100%;
            height: 190px;
        }

        #leaderboard .leaderboard-chart-line {
            stroke-width: 2;
            stroke-linejoin: round;
            stroke-linecap: round;
        }

        #leaderboard .leaderboard-chart-end-dot {
            stroke: #fff;
            stroke-width: 2;
        }

        #leaderboard .leaderboard-chart-gridline {
            stroke: var(--lb-border);
            stroke-width: 1;
        }

        #leaderboard .leaderboard-chart-axis-label {
            fill: currentColor;
            opacity: 0.5;
            font-size: 9px;
        }

        #leaderboard .leaderboard-chart-crosshair {
            stroke: var(--lb-border);
            stroke-width: 1;
        }

        /* Drag-to-compare range brush */
        #leaderboard .leaderboard-chart-canvas {
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
        }

        #leaderboard .leaderboard-chart-brush-rect {
            fill: var(--lb-accent);
            opacity: 0.12;
            pointer-events: none;
        }

        #leaderboard .leaderboard-chart-brush-line {
            stroke: var(--lb-accent);
            stroke-width: 1.5;
            pointer-events: none;
        }

        #leaderboard .leaderboard-chart-brush-hint {
            margin-top: 6px;
            font-size: 0.72em;
            text-align: center;
            opacity: 0.5;
            min-height: 1.2em;
        }

        #leaderboard .leaderboard-range-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 10px;
            padding: 6px 10px;
            border-radius: 8px;
            background: var(--lb-hover);
            color: var(--lb-accent);
            font-size: 0.8em;
            font-weight: 600;
        }

        #leaderboard .leaderboard-range-clear {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: none;
            width: 18px;
            height: 18px;
            padding: 0;
            border: none;
            border-radius: 50%;
            background: transparent;
            color: inherit;
            cursor: pointer;
        }

        #leaderboard .leaderboard-range-clear:hover {
            background: rgba(122, 75, 218, 0.15);
        }

        #leaderboard .leaderboard-range-clear svg {
            width: 12px;
            height: 12px;
        }

        #leaderboard .leaderboard-chart-tooltip {
            position: absolute;
            z-index: 1;
            min-width: 120px;
            padding: 8px 10px;
            border: 1px solid rgb(202, 208, 214);
            border-radius: 8px;
            background: #fff;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
            font-size: 0.78em;
            pointer-events: none;
        }

        #leaderboard .leaderboard-chart-tooltip-date {
            margin-bottom: 4px;
            font-weight: 700;
            color: #333;
        }

        #leaderboard .leaderboard-chart-tooltip-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 1px 0;
        }

        #leaderboard .leaderboard-chart-tooltip-swatch {
            flex: 0 0 auto;
            width: 8px;
            height: 8px;
            border-radius: 2px;
        }

        #leaderboard .leaderboard-chart-tooltip-name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: #666;
        }

        #leaderboard .leaderboard-chart-tooltip-value {
            flex: 0 0 auto;
            font-weight: 700;
            color: #333;
        }

        /* Footer */
        #leaderboard .leaderboard-footer {
            margin-top: 10px;
            font-size: 0.78em;
            text-align: center;
            opacity: 0.55;
        }

        /* Refresh-in-progress blur */
        .leaderboardSpan.blurry-text {
            color: transparent;
            border-radius: 4px;
            background: var(--lb-track);
            text-shadow: none;
        }

        /* Narrow screens: drop the burn column, keep the essentials readable */
        @media (max-width: 560px) {
            #leaderboard th.leaderboard-col-seen,
            #leaderboard td.leaderboard-col-seen,
            #leaderboard th.leaderboard-col-burn,
            #leaderboard td.leaderboard-col-burn {
                display: none;
            }
        }

        /* ============================================================
           Settings modal — plain markup we own outright, styled to match
           the leaderboard card. No framework defaults to fight here.
           ============================================================ */

        .leaderboard-settings-overlay {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.4);
        }

        .leaderboard-settings-modal {
            width: 360px;
            max-width: calc(100vw - 32px);
            background: #fff;
            border: 1px solid rgb(202, 208, 214);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            font-family: "Noto Sans", "Noto Sans JP", "Noto Sans SC", sans-serif;
        }

        .leaderboard-settings-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 12px 14px 20px;
            border-bottom: 1px solid rgb(202, 208, 214);
        }

        .leaderboard-settings-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: #333;
        }

        .leaderboard-settings-close-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: #333;
            cursor: pointer;
        }

        .leaderboard-settings-close-btn svg {
            width: 16px;
            height: 16px;
        }

        .leaderboard-settings-close-btn:hover {
            background: var(--lb-hover);
        }

        .leaderboard-settings-tabs {
            display: flex;
            gap: 16px;
            padding: 0 20px;
            border-bottom: 1px solid rgb(202, 208, 214);
        }

        .leaderboard-settings-tab {
            padding: 10px 2px;
            border: none;
            background: transparent;
            color: rgba(51, 51, 51, 0.6);
            font-family: inherit;
            font-weight: 600;
            font-size: 13px;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            transition: color 0.15s ease, border-color 0.15s ease;
        }

        .leaderboard-settings-tab:hover {
            color: #333;
        }

        .leaderboard-settings-tab.is-active {
            color: var(--lb-accent);
            border-bottom-color: var(--lb-accent);
        }

        .leaderboard-settings-panel {
            padding: 18px 20px 0;
        }

        .leaderboard-settings-input,
        .leaderboard-settings-select {
            width: 100%;
            box-sizing: border-box;
            padding: 8px 10px;
            border: 1px solid rgb(202, 208, 214);
            border-radius: 8px;
            background: #fff;
            color: #333;
            font-family: inherit;
            font-size: 14px;
            line-height: 1.4;
            outline: none;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .leaderboard-settings-input:focus,
        .leaderboard-settings-select:focus {
            border-color: var(--lb-accent);
            box-shadow: 0 0 0 3px rgba(122, 75, 218, 0.15);
        }

        .leaderboard-settings-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 20px;
        }

        .leaderboard-settings-save-btn,
        .leaderboard-settings-cancel-btn {
            border-radius: 8px;
            border: 1px solid rgb(202, 208, 214);
            background: #fff;
            color: #333;
            font-family: inherit;
            font-weight: 600;
            font-size: 13px;
            padding: 8px 16px;
            cursor: pointer;
            transition: background-color 0.15s ease;
        }

        .leaderboard-settings-save-btn:hover,
        .leaderboard-settings-cancel-btn:hover {
            background: var(--lb-hover);
        }

        .leaderboard-settings-save-btn {
            border-color: var(--lb-accent);
            background: var(--lb-accent);
            color: #fff;
        }

        .leaderboard-settings-save-btn:hover {
            background: #6a3bd0;
        }

        /* ============================================================
           Notification modal — replaces SweetAlert's default popup look.
           ============================================================ */

        .leaderboard-alert-overlay {
            position: fixed;
            inset: 0;
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.4);
        }

        .leaderboard-alert-modal {
            width: 340px;
            max-width: calc(100vw - 32px);
            background: #fff;
            border: 1px solid rgb(202, 208, 214);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.1);
            padding: 20px;
            font-family: "Noto Sans", "Noto Sans JP", "Noto Sans SC", sans-serif;
        }

        .leaderboard-alert-title {
            margin-bottom: 8px;
            font-size: 15px;
            font-weight: 700;
            color: #333;
        }

        .leaderboard-alert-message {
            font-size: 14px;
            color: #333;
            line-height: 1.5;
            white-space: pre-line;
        }

        .leaderboard-alert-footer {
            display: flex;
            justify-content: flex-end;
            margin-top: 16px;
        }

        .leaderboard-alert-ok-btn {
            border-radius: 8px;
            border: 1px solid var(--lb-accent);
            background: var(--lb-accent);
            color: #fff;
            font-family: inherit;
            font-weight: 600;
            font-size: 13px;
            padding: 8px 16px;
            cursor: pointer;
            transition: background-color 0.15s ease;
        }

        .leaderboard-alert-ok-btn:hover {
            background: #6a3bd0;
        }
        `;

    var leaderboardStyling = document.createElement('style');
    leaderboardStyling.type = 'text/css';
    if (leaderboardStyling.styleSheet) {
        leaderboardStyling.styleSheet.cssText = leaderboardTableCss;
    } else {
        leaderboardStyling.appendChild(document.createTextNode(leaderboardTableCss));
    }
    document.getElementsByTagName('head')[0].appendChild(leaderboardStyling);

    //------------------------------
    // Leaderboard
    //------------------------------

    function processImportedUsers(file) {
        let reader = new FileReader();
        reader.readAsText(file);
        reader.onload = function (event) {
            let csv = event.target.result;
            csv = csv.replace(/[^ -~]+/g, ' ');//remove non printable characters
            csv = csv.split(',').join(' ');//in case multiple spreadsheet columns are used
            csv += ' ';

            let temp = '';
            let preExistingUsers = '';
            for (let i = 0; i < csv.length; i++) {
                if (csv[i] !== ' ' || csv[i].length === 0) {
                    temp += csv[i];
                } else if (temp !== '') {
                    temp = temp.toLowerCase();

                    //check to see if user is already on the leaderboards
                    let isInList = false;
                    for (let j = 0; j < usersInfoList.length; j++) {
                        if (usersInfoList[j].name.toLowerCase() === temp || usersInfoList[j].name.toLowerCase() === temp + accountNotFoundMessage.toLowerCase()) {
                            isInList = true;
                            break;
                        }
                    }
                    if (!isInList) {
                        usersInfoList.push(createDefaultUserObj(temp));
                    } else {
                        //the following user is already on the board
                        preExistingUsers += temp + ', ';
                    }

                    temp = '';
                }
            }
            if (preExistingUsers != '') {
                preExistingUsers = preExistingUsers.substring(0, preExistingUsers.length - 2);//remove the ', '

                //check if custom box was included succesfully
                notify('The following username(s) already exist on the leaderboard:', preExistingUsers);
            }
            processArray();
        };
        reader.onerror = function () {
            notify('Unable to read ' + file.fileName);
        };
    }

    function importUsers(evt) {
        // Check for the various File API support.
        if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
            notify('The File APIs are not fully supported in this browser.');
            return;
        }

        var files = evt.target.files;
        var file = files[0];

        //browsers/OSes report wildly inconsistent MIME types for .csv (text/csv, empty string,
        //application/vnd.ms-excel, etc. all show up in practice) -- check the extension instead
        if (file.name.toLowerCase().endsWith('.csv')) {
            processImportedUsers(file);
        } else {
            notify('File \'' + file.name + '\' is not a .csv file.', 'Use a .csv file.');
        }
    }

    function exportUsers() {
        let csvContent = "data:text/csv;charset=utf-8,";
        usersInfoList.forEach(function (infoArray, index) {
            let dataString = infoArray.name;//+','+infoArray.level+',https://www.gravatar.com/avatar/'+infoArray.avatar_link+','+wkRealmNames[infoArray.realm_number]+','+infoArray.srs_distribution;
            csvContent += dataString + "\n";
        });
        if (usersInfoList.length != 0) {
            let encodedUri = encodeURI(csvContent);
            let link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "my_leaderboard.csv");
            document.body.appendChild(link);
            link.click();
        } else {
            notify('There were no users to export.');
        }
    }

    //small inline icon shown next to a username for a level-up or a 100% burn
    function achievementIconHtml(item) {
        if (item.hasLeveledUp) {
            return '<svg class="leaderboard-achievement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>Leveled up</title><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
        }
        if (item.totalBurnPercentage >= 100) {
            return '<svg class="leaderboard-achievement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>100% burned</title><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1 5 5 0 0 0 4 4.9M17 5h3a1 1 0 0 1 1 1 5 5 0 0 1-4 4.9"/></svg>';
        }
        return '';
    }

    //small "+2" / "-1.4%" badge showing change since the last refresh; empty when there's nothing to show
    function deltaBadgeHtml(delta, unit) {
        if (!delta) { return ''; }
        const sign = delta > 0 ? '+' : '';
        const direction = delta > 0 ? 'up' : 'down';
        return `<span class="leaderboard-delta leaderboard-delta--${direction}">${sign}${delta}${unit}</span>`;
    }

    //total item count across all 5 SRS stages for one user
    function srsStageTotal(user) {
        const dist = user.srs_distribution[0] || {};
        return srsStages.reduce(function (sum, stage) { return sum + (dist[stage.key + 'Total'] || 0); }, 0);
    }

    //same idea as srsStageTotal, but for a stored history snapshot (which keys its per-stage counts
    //as appr/guru/master/enlight/burn, not apprTotal/guruTotal/...). Returns undefined for an
    //older-format entry that never recorded per-stage counts, so callers can treat it as a gap.
    function seenTotalFromHistoryEntry(entry) {
        if (typeof entry.appr !== 'number') { return undefined; }
        return srsStages.reduce(function (sum, stage) { return sum + (entry[stage.key] || 0); }, 0);
    }

    //rounds a count/total ratio to a 2-decimal percentage, consistent everywhere burn%/seen% is shown
    function percentOf(count, total) {
        return Math.round((count / total) * 100 * 100) / 100;
    }

    //% of all WK items a user has seen (any SRS stage), for the Seen column bar and trend chart
    function seenPercentageFor(user) {
        return percentOf(srsStageTotal(user), totalNumberOfWKItems);
    }

    function historyEntryFor(username, dateKey) {
        const entries = progressHistory[username] || [];
        return entries.find(function (e) { return e.date === dateKey; }) || null;
    }

    //deltas for the currently-selected comparison range (see selectedDeltaRange), for one user --
    //same units as the since-last-refresh deltas they replace in the table (raw level, percentage
    //points for burn, raw item count for seen), just computed between the range's two endpoints
    //instead of between refreshes. Returns null (no range active) or an object with a null field
    //for any metric missing a snapshot at either endpoint -- deltaBadgeHtml already hides those.
    function rangeDeltasFor(user) {
        if (!selectedDeltaRange) { return null; }
        const startEntry = historyEntryFor(user.name, selectedDeltaRange.start);
        const endEntry = historyEntryFor(user.name, selectedDeltaRange.end);
        if (!startEntry || !endEntry) { return { levelDelta: null, burnDelta: null, seenDelta: null }; }

        const levelDelta = endEntry.level - startEntry.level;

        const startBurn = typeof startEntry.burn === 'number' ? percentOf(startEntry.burn, totalNumberOfWKItems) : null;
        const endBurn = typeof endEntry.burn === 'number' ? percentOf(endEntry.burn, totalNumberOfWKItems) : null;
        const burnDelta = (startBurn !== null && endBurn !== null) ? Math.round((endBurn - startBurn) * 100) / 100 : null;

        const startSeen = seenTotalFromHistoryEntry(startEntry);
        const endSeen = seenTotalFromHistoryEntry(endEntry);
        const seenDelta = (typeof startSeen === 'number' && typeof endSeen === 'number') ? endSeen - startSeen : null;

        return { levelDelta: levelDelta, burnDelta: burnDelta, seenDelta: seenDelta };
    }

    function clearSelectedDeltaRange() {
        if (!selectedDeltaRange) { return; }
        selectedDeltaRange = null;
        createLeaderboard();
    }

    //horizontal stacked-bar chart comparing everyone's Apprentice/Guru/Master/Enlightened/Burned
    //counts. Bar length reflects each user's total items learned (relative to whoever has the
    //most); the colored segments within a bar show how those items are split across stages.
    function buildSrsChartHtml() {
        if (usersInfoList.length === 0) { return ''; }

        const maxTotal = Math.max(1, ...usersInfoList.map(srsStageTotal));

        const legendHtml = srsStages.map(function (stage) {
            return `<span class="leaderboard-srs-legend-item">
                <span class="leaderboard-srs-legend-swatch ${stage.colorClass}"></span>${stage.label}
            </span>`;
        }).join('');

        const rowsHtml = usersInfoList.map(function (user) {
            const dist = user.srs_distribution[0] || {};
            const total = srsStageTotal(user);
            const barWidthPct = (total / maxTotal) * 100;

            const segmentsHtml = srsStages.map(function (stage) {
                const count = dist[stage.key + 'Total'] || 0;
                if (!count) { return ''; }
                const segmentPct = (count / total) * 100;
                const tooltip = `${stage.label}: ${count} (${Math.round(segmentPct)}%)`;
                return `<div class="leaderboard-srs-segment ${stage.colorClass}" style="width:${segmentPct}%" title="${escapeHtml(tooltip)}"></div>`;
            }).join('');

            return `<div class="leaderboard-srs-row">
                <div class="leaderboard-srs-row-name">${escapeHtml(user.name)}</div>
                <div class="leaderboard-srs-row-bar-track">
                    <div class="leaderboard-srs-row-bar" style="width:${barWidthPct}%">${segmentsHtml}</div>
                </div>
                <div class="leaderboard-srs-row-total">
                    <span class="leaderboard-srs-row-total-value">${total}</span>
                    ${deltaBadgeHtml(user.srsTotalDelta, '')}
                </div>
            </div>`;
        }).join('');

        return `<div class="leaderboard-srs-chart">
            <div class="leaderboard-srs-legend">${legendHtml}</div>
            ${rowsHtml}
        </div>`;
    }

    //thins a long date list so the line doesn't get overcrowded at wide windows (1Y/All), always
    //keeping the most recent date so the chart's rightmost point still matches the true latest
    //value. Tooltips/deltas naturally end up comparing week-over-week or month-over-month once
    //thinning kicks in, since they read whichever dates actually got plotted.
    function downsampleDates(dateList, maxPoints) {
        if (dateList.length <= maxPoints) { return dateList; }
        const step = Math.ceil(dateList.length / maxPoints);
        const picked = dateList.filter(function (_, i) { return i % step === 0; });
        const last = dateList[dateList.length - 1];
        if (picked[picked.length - 1] !== last) { picked.push(last); }
        return picked;
    }

    //short "Jul 24" label for a 'YYYY-MM-DD' date key, for the trend chart's x-axis
    function formatShortDate(dateKey) {
        const parts = dateKey.split('-');
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    //which users get a line on the trend chart: alphabetical (stable regardless of the
    //leaderboard's live sort order, so a user's color/position here never shifts just
    //because Sort Order changed), capped at the palette size.
    function usersForTrendChart() {
        return usersInfoList
            .slice()
            .sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); })
            .slice(0, trendChartPalette.length);
    }

    //holds the scales/series from the most recent buildLineTrendChartHtml() call, read by
    //attachLineTrendChartInteractivity() afterward so the hover logic doesn't recompute them
    var lastLineTrendChart = null;

    //the SVG viewBox width must match the canvas's real rendered pixel width, or
    //preserveAspectRatio="none" (needed so the chart fills the card at a fixed height) stretches
    //X and Y by different factors -- which distorts the axis-label text along with everything
    //else. Measuring an existing chart-tab-content element (present once the panel has been shown
    //on any tab) keeps the viewBox 1:1 with reality; 600 is only a first-render fallback before
    //that element has ever existed, and self-corrects on the next re-render.
    function measuredChartWidth() {
        const existing = document.querySelector('#leaderboard .leaderboard-chart-tab-content');
        const measured = existing ? existing.clientWidth : 0;
        return measured > 0 ? measured : 600;
    }

    //generic line-over-time chart, one line per user (see usersForTrendChart), built from the daily
    //snapshots recordProgressHistory() has been collecting. Seen%, Burn%, and Level are all just
    //this with a different config -- see the wrappers below.
    //  valueFor(entry)        pulls the plotted number out of a snapshot; return undefined/non-number
    //                         for a snapshot that can't supply this metric (rendered as a gap)
    //  yMax/yGridlineValues   the Y scale and where its gridlines fall
    //  formatValue(v)         axis-label/tooltip text for a Y value
    //  deltaUnit              suffix (e.g. '%') for the tooltip's change-vs-previous-point badge
    //  showValueModeToggle    whether to show the %/# switch (see trendValueMode) -- only burn/seen
    //                         have a meaningful "raw count" alternative to their percentage
    function buildLineTrendChartHtml(config) {
        const valueFor = config.valueFor, yMax = config.yMax, yGridlineValues = config.yGridlineValues,
            formatValue = config.formatValue, emptyMessage = config.emptyMessage, deltaUnit = config.deltaUnit,
            showValueModeToggle = config.showValueModeToggle;
        const trackedUsers = usersForTrendChart();
        const allDates = Array.from(new Set(
            trackedUsers.reduce(function (acc, user) {
                (progressHistory[user.name] || []).forEach(function (entry) { acc.push(entry.date); });
                return acc;
            }, [])
        )).sort();

        //cap to the selected window (see trendWindowPreset), then thin long windows so the line
        //stays readable rather than a dense scribble of daily points
        const windowDays = TREND_WINDOW_DAYS[trendWindowPreset] || 30;
        const windowedDates = isFinite(windowDays) ? allDates.slice(-windowDays) : allDates;
        const dates = downsampleDates(windowedDates, 60);

        if (dates.length < 2) {
            lastLineTrendChart = null;
            return `<div class="leaderboard-chart-empty">${escapeHtml(emptyMessage)}</div>`;
        }

        const width = measuredChartWidth(), height = 190;
        const plotLeft = 34, plotRight = width - 12, plotTop = 12, plotBottom = height - 26;
        const xFor = function (i) { return plotLeft + (i / (dates.length - 1)) * (plotRight - plotLeft); };
        const yFor = function (value) { return plotBottom - (Math.min(Math.max(value, 0), yMax) / yMax) * (plotBottom - plotTop); };

        //the comparison range selected by dragging (see attachLineTrendChartInteractivity) is
        //redrawn fresh on every render from selectedDeltaRange; the same rect/lines are also
        //what the drag handlers reposition live while a drag is in progress
        const brushDates = selectedDeltaRange ? [dates.indexOf(selectedDeltaRange.start), dates.indexOf(selectedDeltaRange.end)] : [-1, -1];
        const hasBrush = brushDates[0] !== -1 && brushDates[1] !== -1;
        const brushX1 = hasBrush ? xFor(Math.min(brushDates[0], brushDates[1])) : 0;
        const brushX2 = hasBrush ? xFor(Math.max(brushDates[0], brushDates[1])) : 0;
        const brushHiddenStyle = hasBrush ? '' : 'display:none';
        const brushHtml = `<rect class="leaderboard-chart-brush-rect" x="${brushX1}" y="${plotTop}" width="${brushX2 - brushX1}" height="${plotBottom - plotTop}" style="${brushHiddenStyle}" />
            <line class="leaderboard-chart-brush-line leaderboard-chart-brush-line--start" x1="${brushX1}" y1="${plotTop}" x2="${brushX1}" y2="${plotBottom}" style="${brushHiddenStyle}" />
            <line class="leaderboard-chart-brush-line leaderboard-chart-brush-line--end" x1="${brushX2}" y1="${plotTop}" x2="${brushX2}" y2="${plotBottom}" style="${brushHiddenStyle}" />`;

        const gridlinesHtml = yGridlineValues.map(function (value) {
            const y = yFor(value);
            return `<line class="leaderboard-chart-gridline" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" />
                <text class="leaderboard-chart-axis-label" x="${plotLeft - 6}" y="${y}" text-anchor="end" dominant-baseline="middle">${escapeHtml(formatValue(value))}</text>`;
        }).join('');

        const xLabelIndices = Array.from(new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]));
        const xLabelsHtml = xLabelIndices.map(function (i) {
            return `<text class="leaderboard-chart-axis-label" x="${xFor(i)}" y="${height - 8}" text-anchor="middle">${escapeHtml(formatShortDate(dates[i]))}</text>`;
        }).join('');

        const series = trackedUsers.map(function (user, index) {
            const color = trendChartPalette[index % trendChartPalette.length];
            const byDate = {};
            (progressHistory[user.name] || []).forEach(function (entry) { byDate[entry.date] = valueFor(entry); });

            const points = [];
            dates.forEach(function (date, i) {
                const value = byDate[date];
                if (typeof value === 'number' && !isNaN(value)) {
                    points.push({ x: xFor(i), y: yFor(value), date: date, value: value });
                }
            });
            return { name: user.name, color: color, points: points };
        }).filter(function (series) { return series.points.length > 0; });

        lastLineTrendChart = { dates: dates, xFor: xFor, plotTop: plotTop, plotBottom: plotBottom, series: series, formatValue: formatValue, deltaUnit: deltaUnit };

        const linesHtml = series.map(function (s) {
            const pathD = s.points.map(function (p, idx) { return (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
            const lastPoint = s.points[s.points.length - 1];
            return `<path class="leaderboard-chart-line" stroke="${s.color}" d="${pathD}" fill="none" />
                <circle class="leaderboard-chart-end-dot" cx="${lastPoint.x}" cy="${lastPoint.y}" r="4" fill="${s.color}" />`;
        }).join('');

        const legendHtml = series.map(function (s) {
            return `<span class="leaderboard-chart-legend-item">
                <span class="leaderboard-chart-legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}
            </span>`;
        }).join('');

        const modeToggleHtml = showValueModeToggle ? `<button type="button"
            class="leaderboard-chart-mode-switch${trendValueMode === 'count' ? ' is-count' : ''}"
            data-trend-mode="${trendValueMode === 'percent' ? 'count' : 'percent'}"
            title="${trendValueMode === 'percent' ? 'Show as item count' : 'Show as percentage'}"
            aria-label="Show as ${trendValueMode === 'percent' ? 'percentage' : 'item count'}"
            aria-pressed="${trendValueMode === 'count'}">
            <span class="leaderboard-chart-mode-switch-thumb"></span>
            <span class="leaderboard-chart-mode-switch-label leaderboard-chart-mode-switch-label--percent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.2"/><circle cx="17.5" cy="17.5" r="2.2"/></svg>
            </span>
            <span class="leaderboard-chart-mode-switch-label leaderboard-chart-mode-switch-label--count">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
            </span>
        </button>` : '';

        const rangeToggleHtml = `<div class="leaderboard-chart-range-toggle" role="group" aria-label="Time range">
            ${Object.keys(TREND_WINDOW_DAYS).map(function (preset) {
            return `<button type="button" class="leaderboard-chart-range-btn${trendWindowPreset === preset ? ' is-active' : ''}" data-window-preset="${preset}">${preset}</button>`;
        }).join('')}
        </div>`;

        return `<div class="leaderboard-chart">
            <div class="leaderboard-chart-header">
                <div class="leaderboard-chart-legend">${legendHtml}</div>
                ${modeToggleHtml}
            </div>
            ${rangeToggleHtml}
            <div class="leaderboard-chart-svg-wrap">
                <svg viewBox="0 0 ${width} ${height}" class="leaderboard-chart-canvas" preserveAspectRatio="none">
                    ${brushHtml}
                    ${gridlinesHtml}
                    ${xLabelsHtml}
                    ${linesHtml}
                    <line class="leaderboard-chart-crosshair" x1="0" y1="${plotTop}" x2="0" y2="${plotBottom}" style="display:none" />
                </svg>
                <div class="leaderboard-chart-tooltip" style="display:none"></div>
            </div>
            <div class="leaderboard-chart-brush-hint" style="${hasBrush ? 'display:none' : ''}">${hasBrush ? '' : 'Drag across the chart to compare two dates'}</div>
        </div>`;
    }

    const trendNoHistoryMessage = 'Come back after a couple more refreshes on different days — the trend chart needs at least two days of history to draw a line.';

    //four evenly-spaced gridline values from 0 to max, rounded to the nearest 100 for a readable axis
    function quarterGridlines(max) {
        return [0, 0.25, 0.5, 0.75, 1].map(function (fraction) { return Math.round(max * fraction / 100) * 100; });
    }

    //shared by the burn%/seen% trend charts, which can each show either % of all WK items or the
    //raw item count (see trendValueMode -- toggled via the chart's own %/# switch). rawValueFor
    //pulls the raw count out of a snapshot; percentOf() derives the percentage from it on demand.
    function buildPercentOrCountTrendChartHtml(rawValueFor) {
        if (trendValueMode === 'count') {
            return buildLineTrendChartHtml({
                valueFor: rawValueFor,
                yMax: totalNumberOfWKItems,
                yGridlineValues: quarterGridlines(totalNumberOfWKItems),
                formatValue: function (v) { return Math.round(v).toLocaleString(); },
                emptyMessage: trendNoHistoryMessage,
                deltaUnit: '',
                showValueModeToggle: true,
            });
        }
        return buildLineTrendChartHtml({
            valueFor: function (entry) {
                const raw = rawValueFor(entry);
                return typeof raw === 'number' ? percentOf(raw, totalNumberOfWKItems) : undefined;
            },
            yMax: 100,
            yGridlineValues: [0, 25, 50, 75, 100],
            formatValue: function (v) { return v + '%'; },
            emptyMessage: trendNoHistoryMessage,
            deltaUnit: '%',
            showValueModeToggle: true,
        });
    }

    function buildBurnTrendChartHtml() {
        return buildPercentOrCountTrendChartHtml(function (entry) { return typeof entry.burn === 'number' ? entry.burn : undefined; });
    }

    function buildSeenTrendChartHtml() {
        return buildPercentOrCountTrendChartHtml(seenTotalFromHistoryEntry);
    }

    function buildLevelTrendChartHtml() {
        return buildLineTrendChartHtml({
            valueFor: function (entry) { return entry.level; },
            yMax: 60,
            yGridlineValues: [0, 15, 30, 45, 60],
            formatValue: function (v) { return String(v); },
            emptyMessage: trendNoHistoryMessage,
            deltaUnit: '',
            showValueModeToggle: false,
        });
    }

    //vertical crosshair that snaps to the nearest date + a tooltip listing every user's
    //value at that date. Must run after the chart's SVG is actually in the DOM. Works for
    //either trend chart -- whichever one is currently in the DOM (see lastLineTrendChart).
    function attachLineTrendChartInteractivity() {
        if (!lastLineTrendChart) { return; }
        const svg = document.querySelector('#leaderboard .leaderboard-chart-canvas');
        const tooltip = document.querySelector('#leaderboard .leaderboard-chart-tooltip');
        const crosshair = document.querySelector('#leaderboard .leaderboard-chart-crosshair');
        const brushRect = document.querySelector('#leaderboard .leaderboard-chart-brush-rect');
        const brushLineStart = document.querySelector('#leaderboard .leaderboard-chart-brush-line--start');
        const brushLineEnd = document.querySelector('#leaderboard .leaderboard-chart-brush-line--end');
        const brushHint = document.querySelector('#leaderboard .leaderboard-chart-brush-hint');
        if (!svg || !tooltip || !crosshair || !brushRect || !brushLineStart || !brushLineEnd) { return; }

        const chart = lastLineTrendChart;

        function nearestDateIndex(viewBoxX) {
            let closestIndex = 0;
            let closestDistance = Infinity;
            chart.dates.forEach(function (_, i) {
                const distance = Math.abs(chart.xFor(i) - viewBoxX);
                if (distance < closestDistance) { closestDistance = distance; closestIndex = i; }
            });
            return closestIndex;
        }

        function showAt(index, pointerEvent) {
            const x = chart.xFor(index);
            crosshair.setAttribute('x1', x);
            crosshair.setAttribute('x2', x);
            crosshair.style.display = '';

            const date = chart.dates[index];
            const rowsHtml = chart.series.map(function (s) {
                const pointIndex = s.points.findIndex(function (p) { return p.date === date; });
                if (pointIndex === -1) { return ''; }
                const point = s.points[pointIndex];
                const previousPoint = pointIndex > 0 ? s.points[pointIndex - 1] : null;
                const delta = previousPoint ? Math.round((point.value - previousPoint.value) * 100) / 100 : null;
                return `<div class="leaderboard-chart-tooltip-row">
                    <span class="leaderboard-chart-tooltip-swatch" style="background:${s.color}"></span>
                    <span class="leaderboard-chart-tooltip-name">${escapeHtml(s.name)}</span>
                    <span class="leaderboard-chart-tooltip-value">${escapeHtml(chart.formatValue(point.value))}</span>
                    ${deltaBadgeHtml(delta, chart.deltaUnit)}
                </div>`;
            }).join('');
            tooltip.innerHTML = `<div class="leaderboard-chart-tooltip-date">${escapeHtml(formatShortDate(date))}</div>${rowsHtml}`;

            const wrapRect = svg.parentElement.getBoundingClientRect();
            let left = pointerEvent.clientX - wrapRect.left + 12;
            const top = Math.max(0, pointerEvent.clientY - wrapRect.top - 10);
            tooltip.style.display = '';
            if (left + tooltip.offsetWidth > wrapRect.width) {
                left = pointerEvent.clientX - wrapRect.left - tooltip.offsetWidth - 12;
            }
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        }

        function pointerToViewBoxX(pointerEvent) {
            const point = svg.createSVGPoint();
            point.x = pointerEvent.clientX;
            point.y = pointerEvent.clientY;
            return point.matrixTransform(svg.getScreenCTM().inverse()).x;
        }

        //click-and-drag range selection (see selectedDeltaRange). Uses pointer capture rather than
        //a window-level listener so pointerup/pointermove keep firing on this exact svg even if the
        //cursor leaves it mid-drag, and so nothing needs manual cleanup -- the svg (and its
        //listeners) are simply thrown away on the next createLeaderboard() re-render.
        let isDragging = false;
        let dragStartIndex = 0;

        function setBrushBounds(index1, index2) {
            const x1 = chart.xFor(Math.min(index1, index2));
            const x2 = chart.xFor(Math.max(index1, index2));
            brushRect.setAttribute('x', x1);
            brushRect.setAttribute('width', x2 - x1);
            brushLineStart.setAttribute('x1', x1); brushLineStart.setAttribute('x2', x1);
            brushLineEnd.setAttribute('x1', x2); brushLineEnd.setAttribute('x2', x2);
            [brushRect, brushLineStart, brushLineEnd].forEach(function (el) { el.style.display = ''; });
        }

        svg.addEventListener('pointerdown', function (pointerEvent) {
            isDragging = true;
            svg.setPointerCapture(pointerEvent.pointerId);
            dragStartIndex = nearestDateIndex(pointerToViewBoxX(pointerEvent));
            setBrushBounds(dragStartIndex, dragStartIndex);
            tooltip.style.display = 'none';
            crosshair.style.display = 'none';
            //re-show the hint (hidden at render time once a range is already selected -- see
            //buildLineTrendChartHtml) so the live date-range readout has somewhere to appear
            if (brushHint) { brushHint.style.display = ''; }
        });

        svg.addEventListener('pointermove', function (pointerEvent) {
            if (isDragging) {
                const currentIndex = nearestDateIndex(pointerToViewBoxX(pointerEvent));
                setBrushBounds(dragStartIndex, currentIndex);
                if (brushHint && currentIndex !== dragStartIndex) {
                    const lo = Math.min(dragStartIndex, currentIndex), hi = Math.max(dragStartIndex, currentIndex);
                    brushHint.textContent = formatShortDate(chart.dates[lo]) + ' → ' + formatShortDate(chart.dates[hi]);
                }
                return;
            }
            showAt(nearestDateIndex(pointerToViewBoxX(pointerEvent)), pointerEvent);
        });

        svg.addEventListener('pointerup', function (pointerEvent) {
            if (!isDragging) { return; }
            isDragging = false;
            svg.releasePointerCapture(pointerEvent.pointerId);
            const endIndex = nearestDateIndex(pointerToViewBoxX(pointerEvent));
            if (endIndex === dragStartIndex) {
                //no real drag happened -- treat it as a click that dismisses any existing selection
                clearSelectedDeltaRange();
                return;
            }
            const lo = Math.min(dragStartIndex, endIndex), hi = Math.max(dragStartIndex, endIndex);
            selectedDeltaRange = { start: chart.dates[lo], end: chart.dates[hi] };
            createLeaderboard();
        });

        svg.addEventListener('pointerleave', function () {
            if (isDragging) { return; }
            crosshair.style.display = 'none';
            tooltip.style.display = 'none';
        });
    }

    //the expandable panel toggled by the toolbar's chart icon: a small tab strip
    //switching between the two chart types built above.
    function buildChartsPanelHtml() {
        const tabs = [
            { key: 'srsStages', label: 'SRS Stages' },
            { key: 'seenTrend', label: 'Seen %' },
            { key: 'burnTrend', label: 'Burn %' },
            { key: 'levelTrend', label: 'Level' },
        ];
        const tabsHtml = tabs.map(function (tab) {
            return `<button type="button" class="leaderboard-chart-tab${activeChartTab === tab.key ? ' is-active' : ''}" data-chart-tab="${tab.key}">${tab.label}</button>`;
        }).join('');

        const activeChartHtml = activeChartTab === 'seenTrend' ? buildSeenTrendChartHtml()
            : activeChartTab === 'burnTrend' ? buildBurnTrendChartHtml()
                : activeChartTab === 'levelTrend' ? buildLevelTrendChartHtml()
                    : buildSrsChartHtml();

        return `<div class="leaderboard-charts-panel">
            <div class="leaderboard-chart-tabs">${tabsHtml}</div>
            <div class="leaderboard-chart-tab-content">${activeChartHtml}</div>
        </div>`;
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function createLeaderboard() {
        //build the rows for a single table covering users[startIndex, endIndex)
        function buildRowsHtml(startIndex, endIndex) {
            let rowsHtml = '';
            for (let j = startIndex; j < endIndex; j++) {
                const user = usersInfoList[j];
                const userErrorNotFoundMessage = user.wasUserFound ? '' : accountNotFoundMessage;
                const displayName = escapeHtml(user.name + userErrorNotFoundMessage);
                const profileHref = encodeURIComponent(user.name);

                const burnTooltip = `Burned: ${user.srs_distribution[0].burnTotal} / ${totalNumberOfWKItems} (${user.totalBurnPercentage}%)`;

                const seenTotal = srsStageTotal(user);
                const seenPercentage = seenPercentageFor(user);
                const seenTooltip = `Seen: ${seenTotal} / ${totalNumberOfWKItems} (${seenPercentage}%)`;

                //a selected chart date-range overrides the normal since-last-refresh deltas
                const rangeDeltas = rangeDeltasFor(user);
                const levelDeltaToShow = rangeDeltas ? rangeDeltas.levelDelta : user.levelDelta;
                const seenDeltaToShow = rangeDeltas ? rangeDeltas.seenDelta : user.srsTotalDelta;
                const burnDeltaToShow = rangeDeltas ? rangeDeltas.burnDelta : user.burnDelta;

                rowsHtml += `<tr>
                    <td class="leaderboard-col-rank" title="${escapeHtml(wkRealmNames[user.realm_number])}">
                        <span class="leaderboard-rank-num">#${j + 1}</span>
                        <span class="leaderboard-realm-badge ${leaderboardColors[user.realm_number]}">${wkRealms[user.realm_number]}</span>
                    </td>
                    <td class="${escapeHtml(user.name)} leaderboard-userImg">
                        <img src="${escapeHtml(user.avatar_link)}"/>
                    </td>
                    <td class="leaderboard-col-user">
                        <a href="users/${profileHref}" target="_blank" class="leaderboard-user-link">
                            <span class="leaderboard-user-name leaderboardSpan">${displayName}</span>
                            ${achievementIconHtml(user)}
                            <span class="leaderboard-level-badge">${user.level}</span>
                            ${deltaBadgeHtml(levelDeltaToShow, '')}
                        </a>
                    </td>
                    <td class="leaderboard-col-seen" title="${escapeHtml(seenTooltip)}">
                        <div class="leaderboard-seen-track"><div class="leaderboard-seen-fill" style="width:${Math.min(seenPercentage, 100)}%"></div></div>
                        <span class="leaderboard-seen-value">${seenTotal} seen</span>
                        ${deltaBadgeHtml(seenDeltaToShow, '')}
                    </td>
                    <td class="leaderboard-col-burn" title="${escapeHtml(burnTooltip)}">
                        <div class="leaderboard-burn-track"><div class="leaderboard-burn-fill" style="width:${Math.min(user.totalBurnPercentage, 100)}%"></div></div>
                        <span class="leaderboard-burn-label">${user.totalBurnPercentage}% burned</span>
                        ${deltaBadgeHtml(burnDeltaToShow, '%')}
                    </td>
                    <td class="leaderboard-col-actions">
                        <span class="${escapeHtml(user.name)} leaderboard-delete-btn" title="Remove ${displayName}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13"/></svg>
                        </span>
                    </td>
                </tr>`;
            }
            return rowsHtml;
        }

        let contentHtml = '';
        let timeSinceLastRefreshHtml = '';

        if (usersInfoList.length === 0) {
            contentHtml = `<div class="leaderboard-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <div>You haven't added any users yet.</div>
                <button type="button" class="leaderboard-empty-add-btn">Add a user</button>
            </div>`;
        } else {
            const rangeBannerHtml = selectedDeltaRange ? `<div class="leaderboard-range-banner">
                <span>Comparing ${escapeHtml(formatShortDate(selectedDeltaRange.start))} → ${escapeHtml(formatShortDate(selectedDeltaRange.end))}</span>
                <button type="button" class="leaderboard-range-clear" title="Clear comparison range">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            </div>` : '';

            contentHtml = `<div class="leaderboard-table-card">
                ${rangeBannerHtml}
                <table>
                    <thead>
                        <tr>
                            <th class="leaderboard-col-rank">Rank</th>
                            <th></th>
                            <th>User</th>
                            <th class="leaderboard-col-seen">Seen</th>
                            <th class="leaderboard-col-burn">Burn</th>
                            <th class="leaderboard-col-actions"></th>
                        </tr>
                    </thead>
                    <tbody>${buildRowsHtml(0, usersInfoList.length)}</tbody>
                </table>
            </div>`;

            timeSinceLastRefreshHtml = `<div class="leaderboard-footer">Refreshed ${timeSinceLastRefreshText} ago</div>`;
        }

        const leaderboardHtml = `<div id="leaderboard" class="dashboard__row">
            <div class="dashboard__widget dashboard__widget--full">
                <div class="community-banner-widget theme--default leaderboard-widget">
                    <div class="leaderboard-header">
                        <h3 class="small-caps">Leaderboard</h3>
                        <div class="leaderboard-toolbar">
                            <div id="leaderboard_loader" class="leaderboard_loader"></div>
                            <span class="leaderboard-icon-btn leaderboard-export" title="Download leaderboard as CSV">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            </span>
                            <label class="leaderboard-icon-btn" for="leaderboard-files-import" title="Import a leaderboard CSV">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 7.5 12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                            </label>
                            <input type="file" id="leaderboard-files-import" name="files[]" accept=".csv" multiple />
                            <span class="leaderboard-icon-btn leaderboard-charts-toggle${showChartsPanel ? ' is-active' : ''}" title="Progress charts">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M8 17V9m4 8V5m4 12v-4" /></svg>
                            </span>
                            <span class="leaderboard-icon-btn leaderboard-refresh" title="Refresh leaderboard">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                            </span>
                            <span class="leaderboard-icon-btn leaderboard-settings" title="Leaderboard settings">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.774.773c.39.39.44.995.12 1.45l-.527.738c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.455.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.45.12l-.737-.527c-.35-.25-.807-.272-1.204-.108-.397.165-.71.506-.78.93l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.149-.894c-.07-.424-.383-.765-.78-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.454.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.738.527c.35.25.806.272 1.204.107.397-.165.71-.505.78-.93l.15-.893Z"/><circle cx="12" cy="12" r="3"/></svg>
                            </span>
                        </div>
                    </div>
                    ${contentHtml}
                    ${showChartsPanel ? buildChartsPanelHtml() : ''}
                    ${timeSinceLastRefreshHtml}
                </div>
            </div>
        </div>`;

        //check if leaderboard is already there
        if (document.getElementById("leaderboard")) {
            const existingLeaderboard = document.getElementById("leaderboard");
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = leaderboardHtml;
            existingLeaderboard.replaceWith(tempDiv.firstChild);
        } else {
            // Find all dashboard rows
            const dashboardRows = document.querySelectorAll('div.dashboard__row');

            // Check if we have at least 3 rows
            if (dashboardRows.length >= 3) {
                const thirdRow = dashboardRows[2]; // Third row (0-indexed)

                const leaderboard = document.createElement('div');
                leaderboard.innerHTML = leaderboardHtml;

                // Insert after the third row
                thirdRow.after(leaderboard);
            }
        }

        //eventlisteners
        const settingsBtn = document.querySelector('#leaderboard .leaderboard-settings');
        if (settingsBtn) settingsBtn.addEventListener('click', open_settings);

        const refreshBtn = document.querySelector('#leaderboard .leaderboard-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', refreshDashboard);

        const chartsToggleBtn = document.querySelector('#leaderboard .leaderboard-charts-toggle');
        if (chartsToggleBtn) chartsToggleBtn.addEventListener('click', function () {
            showChartsPanel = !showChartsPanel;
            saveToCache(CACHE_KEY_CHARTS_OPEN, showChartsPanel);
            createLeaderboard();
        });

        document.querySelectorAll('#leaderboard .leaderboard-chart-tab').forEach(function (tabBtn) {
            tabBtn.addEventListener('click', function () {
                activeChartTab = tabBtn.dataset.chartTab;
                saveToCache(CACHE_KEY_ACTIVE_CHART_TAB, activeChartTab);
                createLeaderboard();
            });
        });

        const modeSwitch = document.querySelector('#leaderboard .leaderboard-chart-mode-switch');
        if (modeSwitch) modeSwitch.addEventListener('click', function () {
            //flip the switch's own class immediately so its slide transition actually plays on this
            //element -- createLeaderboard() tears down and rebuilds the whole card, so if the mode
            //were only set on trendValueMode here, the thumb would just appear in its new position
            //with nothing to animate from. The chart data swap is inherently an instant cut (a
            //percent-vs-count axis rescale isn't something to tween), so it's delayed just long
            //enough for the switch's own animation to finish first.
            const newMode = modeSwitch.dataset.trendMode;
            modeSwitch.classList.toggle('is-count', newMode === 'count');
            modeSwitch.setAttribute('aria-pressed', String(newMode === 'count'));
            trendValueMode = newMode;
            saveToCache(CACHE_KEY_TREND_VALUE_MODE, trendValueMode);
            setTimeout(createLeaderboard, 250);
        });

        document.querySelectorAll('#leaderboard .leaderboard-chart-range-btn').forEach(function (rangeBtn) {
            rangeBtn.addEventListener('click', function () {
                trendWindowPreset = rangeBtn.dataset.windowPreset;
                saveToCache(CACHE_KEY_TREND_WINDOW_PRESET, trendWindowPreset);
                createLeaderboard();
            });
        });

        if (showChartsPanel && (activeChartTab === 'seenTrend' || activeChartTab === 'burnTrend' || activeChartTab === 'levelTrend')) {
            attachLineTrendChartInteractivity();
        }

        const rangeClearBtn = document.querySelector('#leaderboard .leaderboard-range-clear');
        if (rangeClearBtn) rangeClearBtn.addEventListener('click', clearSelectedDeltaRange);

        const exportBtn = document.querySelector('#leaderboard .leaderboard-export');
        if (exportBtn) exportBtn.addEventListener('click', exportUsers);

        const importInput = document.getElementById('leaderboard-files-import');
        if (importInput) importInput.addEventListener('change', importUsers);

        const emptyAddBtn = document.querySelector('#leaderboard .leaderboard-empty-add-btn');
        if (emptyAddBtn) emptyAddBtn.addEventListener('click', open_settings);

        const leaderboardDeleteBtns = document.querySelectorAll('#leaderboard .leaderboard-delete-btn');
        leaderboardDeleteBtns.forEach(element => {
            element.addEventListener('click', deleteUser);
        });
    }

    //global, added once (not per-render, unlike the rest of createLeaderboard()'s listeners)
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { clearSelectedDeltaRange(); }
    });

    startup();
})();
