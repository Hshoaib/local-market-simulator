// --- Company cards in the left-hand sidebar ---

const companySidebar = document.getElementById('companySidebar');

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

function createButton(className, { html, text, title, onClick }) {
    const btn = document.createElement('button');
    btn.className = className;
    if (html !== undefined) btn.innerHTML = html;
    if (text !== undefined) btn.innerText = text;
    if (title) btn.title = title;
    btn.onclick = onClick;
    return btn;
}

function renderCards() {
    companySidebar.innerHTML = '';
    const groups = getGroupedCompanies();
    groups.forEach(({ root, members }, index) => {
        companySidebar.appendChild(buildCompanyCard(root, members, { isFirst: index === 0, isLast: index === groups.length - 1 }));
    });
}

function buildCompanyCard(root, members, position) {
    const card = document.createElement('div');
    card.className = 'company-card';
    card.style.borderTopColor = root.color;
    enableLocationDrop(card, root);

    card.appendChild(buildCardHeader(card, root, members, position));

    const body = document.createElement('div');
    body.className = 'card-body';
    if (root.collapsed) body.style.display = 'none';

    // Rows without a result (pending / no road access) sink to the bottom.
    const statusRank = n => (n.status === 'ok' ? 0 : 1);
    const groupLocations = members.flatMap(m => locations.filter(n => n.comp === m.id));
    groupLocations.sort((a, b) => statusRank(a) - statusRank(b)
        || (calcMode === 'share' ? b.share - a.share : a.fasciaCount - b.fasciaCount));

    if (groupLocations.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hint-text';
        empty.innerText = 'No locations active.';
        body.appendChild(empty);
    }
    groupLocations.forEach(n => body.appendChild(buildLocationRow(n, members.length > 1)));

    card.appendChild(body);
    return card;
}

// Location rows can be dragged between cards to transfer ownership.
function enableLocationDrop(card, root) {
    const clearHighlight = () => {
        card.style.boxShadow = '';
        card.style.borderColor = '';
        card.style.borderTopColor = root.color;
    };

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.style.boxShadow = `0 0 15px ${root.color}`;
        card.style.borderColor = root.color;
    });
    card.addEventListener('dragleave', (e) => {
        if (card.contains(e.relatedTarget)) return; // Still inside the card
        clearHighlight();
    });
    card.addEventListener('drop', (e) => {
        e.preventDefault();
        clearHighlight();
        const draggedLocationId = e.dataTransfer.getData('text/plain');
        if (draggedLocationId) moveLocationToCompany(draggedLocationId, root.id);
    });
}

function buildCardHeader(card, root, members, { isFirst, isLast }) {
    const header = document.createElement('div');
    header.className = 'card-header';

    const isGroup = members.length > 1;
    const combinedName = root.alias || members.map(m => m.name).join(' + ');

    const headerLeft = document.createElement('div');
    headerLeft.className = 'card-header-left';

    const reorder = document.createElement('div');
    reorder.className = 'reorder-container';
    const upBtn = createButton('reorder-btn', { html: iconChevronUp, title: 'Move up', onClick: () => moveCompanyGroup(root.id, -1) });
    const downBtn = createButton('reorder-btn', { html: iconChevronDown, title: 'Move down', onClick: () => moveCompanyGroup(root.id, 1) });
    upBtn.disabled = isFirst;
    downBtn.disabled = isLast;
    reorder.append(upBtn, downBtn);
    headerLeft.appendChild(reorder);

    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.title = 'Double-click to rename';
    titleEl.innerText = combinedName;
    titleEl.ondblclick = (e) => {
        e.stopPropagation();
        startRename(titleEl, root, isGroup, combinedName);
    };
    headerLeft.appendChild(titleEl);

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'color-picker';
    colorPicker.title = 'Change colour';
    colorPicker.value = root.color;
    colorPicker.oninput = (e) => {
        // Live preview while dragging the picker; the sidebar is rebuilt once it closes.
        root.color = e.target.value;
        card.style.borderTopColor = root.color;
        updateLocationVisuals();
        drawDistanceLines();
    };
    colorPicker.onchange = () => renderCards();
    headerLeft.appendChild(colorPicker);

    header.appendChild(headerLeft);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'card-header-actions';

    if (isGroup) {
        actionsDiv.appendChild(createButton('action-btn', { html: iconBrokenChain, title: 'Unmerge', onClick: () => unmerge(root.id) }));
    } else {
        const mergeBtn = createButton('action-btn', { html: iconChain, title: 'Merge', onClick: () => toggleMerge(root.id) });
        if (pendingMergeCompId === root.id) mergeBtn.classList.add('active-merge');
        actionsDiv.appendChild(mergeBtn);
    }

    actionsDiv.appendChild(createButton('add-site-btn', { text: '+ Location', onClick: () => openPostcodeModal(root.id) }));
    actionsDiv.appendChild(createButton('action-btn', {
        html: root.collapsed ? '+' : '−',
        onClick: () => { root.collapsed = !root.collapsed; renderCards(); }
    }));
    actionsDiv.appendChild(createButton('action-btn delete-btn', { html: iconDelete, onClick: () => deleteCompany(root.id) }));

    header.appendChild(actionsDiv);
    return header;
}

function startRename(titleEl, root, isGroup, combinedName) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'name-input title-input';
    input.value = root.alias ? root.alias : (isGroup ? combinedName : root.name);

    let saved = false;
    const saveName = () => {
        if (saved) return; // Enter followed by blur would otherwise save twice
        saved = true;
        const val = input.value.trim();
        if (isGroup) {
            root.alias = val !== '' ? val : null;
        } else {
            if (val !== '') root.name = val;
            root.alias = null;
        }
        renderCards();
    };
    input.onblur = saveName;
    input.onkeydown = (ev) => { if (ev.key === 'Enter') saveName(); };

    titleEl.innerHTML = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();
}

function buildLocationRow(n, isGroup) {
    const comp = findCompany(n.comp);
    const row = document.createElement('div');
    row.className = 'site-row';
    row.draggable = true;

    row.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', n.id);
        row.style.opacity = '0.4';
    };
    row.ondragend = () => { row.style.opacity = '1'; };

    if (activeLocationIds.includes(n.id)) {
        row.classList.add('selected');
        row.style.borderLeft = `3px solid ${comp.color}`;
    }

    const memberDot = isGroup ? `<span class="member-dot" style="background:${comp.color};"></span>` : '';
    row.innerHTML = `
        <div class="site-id" title="Orig. Co ID: ${n.comp}">${memberDot}#${siteNumber(n.id)}</div>
        <div class="site-name"><input type="text" id="name-${n.id}" class="name-input" placeholder="Name" value="${escapeHtml(n.name || '')}"></div>
        <div class="site-vol"><input type="number" id="vol-${n.id}" class="vol-input" value="${n.vol}" min="0" step="10"></div>
        <div class="site-share" id="share-${n.id}"></div>
        <div class="site-warning" id="warn-${n.id}" style="opacity: ${isLocationWarning(n) ? '1' : '0'};" title="Threshold Exceeded">${iconWarning}</div>
    `;

    renderShareCell(row.querySelector('.site-share'), n);

    row.onclick = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.closest('button')) return;
        toggleSelection(n.id, e.ctrlKey || e.metaKey);
    };

    row.appendChild(createButton('site-icon-btn del', {
        html: iconDelete,
        onClick: (e) => { e.stopPropagation(); deleteLocation(n.id); }
    }));

    row.querySelector('.name-input').addEventListener('input', (e) => {
        n.name = e.target.value;
        updateLocationVisuals();
    });

    row.querySelector('.vol-input').addEventListener('input', (e) => {
        const newVol = parseFloat(e.target.value);
        n.vol = isNaN(newVol) || newVol < 0 ? 0 : newVol;
        calculateShares();
        draw();
        updateDataDisplays();
    });

    return row;
}

const STATUS_HINTS = {
    pending: 'Travel times not fetched yet: use the refresh button in the toolbar',
    unroutable: 'No road within ~350 m for this travel mode'
};

function renderShareCell(el, n) {
    el.innerText = formatMetric(n);
    el.classList.toggle('pending', n.status !== 'ok');
    el.title = STATUS_HINTS[n.status] || '';
}

// Refreshes the numbers in existing rows without rebuilding the cards (keeps input focus).
function updateDataDisplays() {
    locations.forEach(n => {
        const shareEl = document.getElementById(`share-${n.id}`);
        if (shareEl) renderShareCell(shareEl, n);

        const warnEl = document.getElementById(`warn-${n.id}`);
        if (warnEl) warnEl.style.opacity = isLocationWarning(n) ? '1' : '0';

        const nameEl = document.getElementById(`name-${n.id}`);
        if (nameEl && document.activeElement !== nameEl) nameEl.value = n.name || '';

        const volEl = document.getElementById(`vol-${n.id}`);
        if (volEl && document.activeElement !== volEl) volEl.value = n.vol;
    });
}
