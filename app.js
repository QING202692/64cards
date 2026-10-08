/* ============================================================
   《64 卦》Vue3 UI 层（古风 · 道法自然）
   逻辑层 data.js / game.js / ai.js 不改动，仅通过：
   - window.wrapGame 注入响应式包装
   - window.onFx 接收扣血/破盾/治疗特效事件
   ============================================================ */
(function () {
  const { createApp, ref, reactive, computed, watch, nextTick } = Vue;

  // ---------- 爻线渲染（规则生成；数组索引 0=下爻，视觉从上往下只映射一次） ----------
  const VISUAL_3 = ['upper', 'middle', 'lower'];

  function yaoBars(isYang) {
    return isYang
      ? '<span class="yao-bar"></span>'
      : '<span class="yao-bar"></span><span class="yao-bar"></span>';
  }

  // 经卦三爻
  function trigramYaoHTML(card, stackCls) {
    const yaos = TRIGRAM_YAO[card.trigram];
    let h = `<div class="yao-stack ${stackCls || ''}">`;
    for (const pos of VISUAL_3) {
      const i = CHANGING_INDEX[pos];
      const yang = yaos[i] === 1;
      const changed = card.changing === pos;
      h += `<div class="yao ${yang ? 'yang' : 'yin'}${changed ? ' changed' : ''}">${yaoBars(yang)}</div>`;
    }
    return h + '</div>';
  }

  // 64卦六爻（上卦三爻接下卦三爻）
  function hexagramYaoHTML(upperCard, lowerCard) {
    const rows = [
      { c: upperCard, pos: 'upper' }, { c: upperCard, pos: 'middle' }, { c: upperCard, pos: 'lower' },
      { c: lowerCard, pos: 'upper' }, { c: lowerCard, pos: 'middle' }, { c: lowerCard, pos: 'lower' },
    ];
    let h = '<div class="yao-stack hex-yao-stack">';
    for (const r of rows) {
      const yang = TRIGRAM_YAO[r.c.trigram][CHANGING_INDEX[r.pos]] === 1;
      const changed = r.c.changing === r.pos;
      h += `<div class="yao ${yang ? 'yang' : 'yin'}${changed ? ' changed' : ''}">${yaoBars(yang)}</div>`;
    }
    return h + '</div>';
  }

  // ---------- 卡牌水纹边框（古铜细线三层；描边不随拉伸变形） ----------
  function waveFrame(w, h) {
    const inset = 10, r = 5, step = 10;
    const nX = Math.floor((w - inset * 2 - r * 2) / step);
    const nY = Math.floor((h - inset * 2 - r * 2) / step);
    let d = '';
    // 上边（弧向牌内/向下）
    d += `M${inset} ${inset} L${inset + r} ${inset}`;
    for (let i = 0; i < nX; i++) d += `a${r} ${r} 0 0 1 ${step} 0`;
    d += ` L${w - inset} ${inset}`;
    // 右边（弧向左）
    d += ` L${w - inset} ${inset + r}`;
    for (let i = 0; i < nY; i++) d += `a${r} ${r} 0 0 1 0 ${step}`;
    d += ` L${w - inset} ${h - inset}`;
    // 下边（弧向上）
    d += ` L${w - inset - r} ${h - inset}`;
    for (let i = 0; i < nX; i++) d += `a${r} ${r} 0 0 1 -${step} 0`;
    d += ` L${inset} ${h - inset}`;
    // 左边（弧向右）
    d += ` L${inset} ${h - inset - r}`;
    for (let i = 0; i < nY; i++) d += `a${r} ${r} 0 0 1 0 -${step}`;
    d += ' Z';
    const ves = 'vector-effect="non-scaling-stroke"';
    return (
      `<svg class="wave-frame" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
      `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="9" class="wf-outer" ${ves}/>` +
      `<path d="${d}" class="wf-wave" ${ves}/>` +
      `<rect x="6.5" y="6.5" width="${w - 13}" height="${h - 13}" rx="6" class="wf-inner" ${ves}/>` +
      `</svg>`
    );
  }

  // 卦序中文数字（1~64）
  function cnNum(n) {
    const d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return d[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + d[n - 10];
    if (n < 60) {
      const t = Math.floor(n / 10), u = n % 10;
      return d[t] + '十' + (u ? d[u] : '');
    }
    if (n === 60) return '六十';
    if (n < 64) return '六十' + d[n - 60];
    return '六十四';
  }

  // 状态标签
  const BUFF_LABEL = {
    noReflect: '禁反弹', reflect: '反弹', damageReduce: '减伤',
    extraQi: '聚气', regen: '恢复', damageBonus: '增伤', extraPlay: '连出',
  };
  const DEBUFF_LABEL = {
    noHighCost: '封气', poison: '中毒', drawReduce: '少摸', qiReduce: '减气',
    stun: '眩晕', noDraw: '封摸', costIncrease: '耗气',
  };
  const PHASE_TEXT = { draw: '摸牌', combine: '组卦', action: '出牌', reaction: '反应', settle: '结算' };

  // ---------- 无面 bust 头像（按 player.id 分配颜色，参考图三） ----------
  const BUST_JACKET = ['#5a3a1a', '#c85a7c', '#2a2a3a', '#5ab8a8'];
  function bustSVG(id) {
    const isFemale = id === 1 || id === 3;
    const circleColor = isFemale ? '#e8a87c' : '#9eb5d6';
    const jacket = BUST_JACKET[id] || '#3a3a3a';
    if (isFemale) {
      // 长发女像
      return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" class="bust-svg">
        <circle cx="30" cy="30" r="30" fill="${circleColor}"/>
        <path d="M21 30 Q21 50 27 50 L33 50 Q39 50 39 30 L39 22 Q39 12 30 11 Q21 12 21 22 Z" fill="#1a0e08"/>
        <ellipse cx="30" cy="22" rx="7.5" ry="8.5" fill="#e8c4a0"/>
        <path d="M14 52 Q14 38 30 36 Q46 38 46 52 L46 60 L14 60 Z" fill="${jacket}"/>
        <path d="M26 37 Q30 39 34 37 L32 41 L28 41 Z" fill="#ffffff"/>
      </svg>`;
    }
    // 短发男像
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" class="bust-svg">
      <circle cx="30" cy="30" r="30" fill="${circleColor}"/>
      <ellipse cx="30" cy="22" rx="8" ry="9" fill="#e8c4a0"/>
      <path d="M22 22 Q22 13 30 11 Q38 13 38 22 L38 19 Q38 13 30 12 Q22 13 22 19 Z" fill="#1a0e08"/>
      <path d="M14 52 Q14 38 30 36 Q46 38 46 52 L46 60 L14 60 Z" fill="${jacket}"/>
      <path d="M27 36 L30 42 L33 36 Z" fill="#ffffff"/>
    </svg>`;
  }

  // ---------- 组件：玩家面板（横版用于对手，竖版用于自己） ----------
  const PlayerPanel = {
    props: ['player', 'active', 'targetable', 'fxItems', 'shake', 'vertical'],
    emits: ['pick'],
    computed: {
      hpPct() { return Math.max(0, this.player.hp / this.player.maxHp * 100) + '%'; },
      shieldPct() { return Math.min(100, (this.player.shield || 0) / this.player.maxHp * 100) + '%'; },
      qiPct() { return (this.player.qi / this.player.maxQi * 100) + '%'; },
      avatar() { return this.player.isHuman ? '你' : this.player.name.slice(-1); },
      bustHTML() { return bustSVG(this.player.id); },
      isStunned() { return (this.player.debuffs || []).some(d => d.debuff === 'stun'); },
      panelClass() {
        return {
          vertical: this.vertical,
          'is-active': this.active,
          targetable: this.targetable,
          dead: !this.player.alive,
          [this.shake]: !!this.shake,
        };
      },
      tags() {
        const out = [];
        (this.player.buffs || []).forEach(b => out.push({ cls: 'tag-buff', text: (BUFF_LABEL[b.buff] || b.buff) + (b.value ? b.value : '') }));
        (this.player.debuffs || []).forEach(d => out.push({ cls: 'tag-debuff', text: (DEBUFF_LABEL[d.debuff] || d.debuff) + (d.value ? d.value : '') }));
        return out;
      },
    },
    template: `
      <div class="player-panel" :class="panelClass" @click="$emit('pick', player.id)">
        <div class="general" :class="{ big: vertical }" :title="player.name">
          <span class="bust" v-html="bustHTML"></span>
          <span v-if="isStunned" class="stun"></span>
        </div>
        <div class="p-info">
          <div class="p-name">
            <span class="p-name-text">{{ player.name }}</span>
            <span class="p-meta">
              <em class="mini-hand" v-if="!player.isHuman">牌 {{ player.hand.length }}</em>
            </span>
          </div>
          <div class="stat-row hp-row">
            <span class="stat-icon hp-icon">命</span>
            <div class="bar hp-bar">
              <div class="bar-fill hp" :style="{ width: hpPct }"></div>
              <div class="bar-text">{{ player.hp }}/{{ player.maxHp }}</div>
            </div>
          </div>
          <div class="stat-row shield-row" v-if="player.shield > 0">
            <span class="stat-icon shield-icon">盾</span>
            <div class="bar shield-bar">
              <div class="bar-fill shield" :style="{ width: shieldPct }"></div>
              <div class="bar-text">{{ player.shield }}</div>
            </div>
          </div>
          <div class="stat-row qi-row">
            <span class="stat-icon qi-icon">气</span>
            <div class="bar qi-bar">
              <div class="bar-fill qi" :style="{ width: qiPct }"></div>
              <div class="bar-text">{{ player.qi }}/{{ player.maxQi }}</div>
            </div>
          </div>
          <div class="tag-row">
            <span v-for="(t, i) in tags" :key="i" class="status-tag" :class="t.cls">{{ t.text }}</span>
          </div>
        </div>
        <div class="fx-layer">
          <span v-for="fx in fxItems" :key="fx.uid" class="fx-float" :class="fx.type">{{ fx.text }}</span>
        </div>
      </div>
    `,
  };

  // ---------- 组件：8卦手牌（水纹小牌） ----------
  const HandCard = {
    props: ['card', 'index', 'total', 'selected', 'disabled'],
    emits: ['pick'],
    computed: {
      info() { return TRIGRAM_INFO[this.card.trigram]; },
      yaoHTML() { return trigramYaoHTML(this.card, 'mc-yao'); },
      frame() { return waveFrame(72, 100); },
      // 斗地主式水平一排：按手牌数量分档控制重叠步长
      fanStyle() {
        const t = this.total;
        const step = t <= 7 ? 64 : t <= 10 ? 52 : t <= 13 ? 42 : 34;
        return { marginLeft: this.index === 0 ? '0' : (step - 70) + 'px', zIndex: this.index };
      },
    },
    template: `
      <div class="hand-card"
           :class="{ changing: !!card.changing, selected: selected, disabled: disabled }"
           :style="fanStyle"
           @click="!disabled && $emit('pick', index)">
        <span class="frame-slot" v-html="frame"></span>
        <div class="mc-name">{{ info.name }}</div>
        <div class="mc-seal"><span v-html="yaoHTML"></span></div>
      </div>
    `,
  };

  // ---------- 组件：64卦大卡牌（图二样式） ----------
  const HexCard = {
    props: ['upper', 'lower'],
    computed: {
      hex() { return getHexagram(this.upper.trigram, this.lower.trigram); },
      changing() { return !!(this.upper.changing || this.lower.changing); },
      changedHex() { return this.changing ? getChangedHexagram(this.upper, this.lower) : null; },
      yaoHTML() { return hexagramYaoHTML(this.upper, this.lower); },
      quote() { return getHexQuote(this.hex.id); },
      changedQuote() { return this.changedHex ? getHexQuote(this.changedHex.id) : ''; },
      titleChar() {
        const n = (this.hex && this.hex.name) || '';
        // 4 字名（如 风天小畜/火雷噬嗑）取末 2 字作为卦名主体；否则取末 1 字
        return n.length >= 4 ? n.slice(-2) : n.slice(-1);
      },
      titleStyle() {
        // 4 字名标题占 2 字，需缩小字号 + 字距
        const n = (this.hex && this.hex.name) || '';
        return n.length >= 4 ? { fontSize: '28px', letterSpacing: '4px' } : null;
      },
      vnameStyle() {
        // 印圆内竖排完整名：按字数动态缩字号/字距，避免 4 字溢出
        const len = ((this.hex && this.hex.name) || '').length;
        if (len >= 5) return { fontSize: '10px', letterSpacing: '1px' };
        if (len === 4) return { fontSize: '11px', letterSpacing: '2px' };
        if (len === 3) return { fontSize: '13px', letterSpacing: '3px' };
        return null;
      },
      cnId() { return cnNum(this.hex.id); },
      frame() { return waveFrame(210, 290); },
    },
    template: `
      <div>
        <div class="hex-card" :class="{ 'is-changing': changing }">
          <span class="frame-slot" v-html="frame"></span>
          <div class="hc-index">周易·第{{ cnId }}卦</div>
          <div class="hc-qi-seal">气<b>{{ hex.cost }}</b></div>
          <div class="hc-top">
            <span class="hc-name" :style="titleStyle">{{ titleChar }}</span>
          </div>
          <div class="hc-seal">
            <div class="seal-circle">
              <span class="seal-yaos" v-html="yaoHTML"></span>
              <span class="seal-vname" :style="vnameStyle">{{ hex.name }}</span>
            </div>
          </div>
          <div class="hc-label"><i></i><span>机 制</span><i></i></div>
          <div class="hc-box hc-effect">{{ hex.desc }}</div>
          <div class="hc-label"><i></i><span>释 义</span><i></i></div>
          <div class="hc-box hc-quote">{{ quote }}</div>
        </div>
        <div class="changed-note" v-if="changedHex">
          <div class="cn-title">变卦 → {{ changedHex.id }}｜{{ changedHex.name }}（各生效50%）</div>
          <div class="cn-eff">{{ changedHex.desc }}</div>
          <div class="cn-quote">{{ changedQuote }}</div>
        </div>
      </div>
    `,
  };

  // ---------- 组件：64卦小牌（卦牌区；悬停显示大卡牌） ----------
  const HexMiniCard = {
    components: { HexCard },
    props: ['card', 'index', 'selected', 'preview'],
    emits: ['pick', 'split', 'commit', 'hover'],
    computed: {
      titleChar() {
        const n = (this.card && this.card.hex && this.card.hex.name) || '';
        return n.length >= 4 ? n.slice(-2) : n.slice(-1);
      },
      nameStyle() {
        // 4 字名小牌显示 2 字，需缩小字号
        const n = (this.card && this.card.hex && this.card.hex.name) || '';
        return n.length >= 4 ? { fontSize: '13px', letterSpacing: '1px' } : null;
      },
      sixYao() { return hexagramYaoHTML(this.card.originalUpper, this.card.originalLower); },
      frame() { return waveFrame(72, 100); },
    },
    template: `
      <div class="hex-mini"
           :class="{ changing: card.isChanging, selected: selected, preview: preview }"
           @click="preview ? $emit('commit') : $emit('pick', index)"
           @contextmenu.prevent="!preview && $emit('split', index)"
           @mouseenter="$emit('hover', card)"
           @mouseleave="$emit('hover', null)">
        <span class="frame-slot" v-html="frame"></span>
        <span class="hm-cost">{{ card.hex.cost }}</span>
        <div class="mc-name" :style="nameStyle">{{ titleChar }}</div>
        <div class="mc-seal hm-seal"><span v-html="sixYao"></span></div>
      </div>
    `,
  };

  // ---------- 主应用 ----------
  const app = createApp({
    components: { PlayerPanel, HandCard, HexCard, HexMiniCard },
    setup() {
      const gameRef = ref(null);
      const selected = ref([]);        // 八卦手牌选中（组卦槽）
      const selectedHex = ref(null);   // 64卦牌区选中（待出牌）
      const hoveredHex = ref(null);    // 悬停显示的 64 卦大卡牌（根级 tooltip）
      const pendingTarget = ref(false);
      const logBox = ref(null);

      const fxMap = reactive({});
      const shakeMap = reactive({});
      let fxUid = 1;
      const shakeTimers = {};

      // 特效事件：飘字 + 震动
      function onFx(fx) {
        const id = fx.id;
        if (!fxMap[id]) fxMap[id] = [];
        const textMap = {
          damage: '-' + fx.amount,
          heal: '+' + fx.amount,
          shieldHit: '挡 ' + fx.amount,
          shieldGain: '盾 +' + fx.amount,
          dead: '出局',
          shieldBreak: '',
        };
        if (textMap[fx.type]) {
          const uid = fxUid++;
          fxMap[id].push({ uid, type: fx.type, text: textMap[fx.type] });
          setTimeout(() => {
            const arr = fxMap[id];
            if (arr) {
              const k = arr.findIndex(f => f.uid === uid);
              if (k >= 0) arr.splice(k, 1);
            }
          }, 1100);
        }

        let cls = '';
        if (fx.type === 'damage') cls = 'shake-damage';
        else if (fx.type === 'shieldHit') cls = 'shake-shield';
        else if (fx.type === 'shieldBreak') cls = 'shake-shield flash-break';
        if (cls) {
          shakeMap[id] = cls;
          clearTimeout(shakeTimers[id]);
          shakeTimers[id] = setTimeout(() => { shakeMap[id] = ''; }, 560);
        }
      }

      // 注入逻辑层钩子
      window.wrapGame = g => reactive(g);
      window.onFx = onFx;
      initGame();
      gameRef.value = game;

      // 基础派生
      const players = computed(() => gameRef.value.players);
      const self = computed(() => gameRef.value.players[0]);
      const rivals = computed(() => gameRef.value.players.slice(1));
      const slots = computed(() => gameRef.value.combineSlots);
      const currentName = computed(() => gameRef.value.players[gameRef.value.currentPlayer].name);
      const phaseText = computed(() => PHASE_TEXT[gameRef.value.phase] || '');
      const isHumanTurn = computed(() =>
        gameRef.value.phase === 'action' && gameRef.value.currentPlayer === 0 && !gameRef.value.gameOver
      );
      const humanShock = computed(() => (self.value.debuffs || []).some(d => d.debuff === 'stun'));
      const lifeChainText = computed(() => gameRef.value.sameLifeChain.join(' → '));
      const deathChainText = computed(() => gameRef.value.sameDeathChain.join(' → '));

      // 只要自己存活且游戏未结束，任何时间都可以组卦/拆卦
      const canInteract = computed(() => !!self.value.alive && !gameRef.value.gameOver);

      // 组卦槽实时预览的64卦（不入牌区）
      const previewCombined = computed(() => {
        const u = gameRef.value.combineSlots[0], l = gameRef.value.combineSlots[1];
        return u && l ? makeCombined(u, l) : null;
      });

      // 当前选中待出的64卦牌
      const selectedHexCard = computed(() =>
        selectedHex.value != null ? self.value.hexCards[selectedHex.value] : null
      );

      // 出牌被阻止的原因（null=可以出）。用于按钮提示与顶部横幅
      const playBlockReason = computed(() => {
        if (!isHumanTurn.value) return null;
        if (pendingTarget.value) return null;
        const c = selectedHexCard.value;
        if (!c) return '请先在64卦牌区左键选择一张卦牌';
        if (c.hex.isReaction) return `【${c.hex.name}】是反应牌，受到攻击时自动触发`;
        let cost = c.hex.cost;
        if (self.value.debuffs.some(d => d.debuff === 'costIncrease')) cost += 1;
        const noHigh = self.value.debuffs.find(d => d.debuff === 'noHighCost');
        if (noHigh && cost >= noHigh.value) return `受封气影响，无法打出 ${cost} 气以上的卦`;
        if (self.value.qi < cost) return `气不足：需 ${cost} 气，现有 ${self.value.qi} 气，结束回合可回气`;
        return null;
      });

      const canPlay = computed(() =>
        isHumanTurn.value && !pendingTarget.value && playBlockReason.value === null
      );

      // 选八卦手牌（组卦槽，任意存活时间可用）
      function syncSlots() {
        const hand = self.value.hand;
        gameRef.value.combineSlots = [
          selected.value[0] != null ? hand[selected.value[0]] : null,
          selected.value[1] != null ? hand[selected.value[1]] : null,
        ];
      }
      function toggleCard(idx) {
        if (!canInteract.value || pendingTarget.value) return;
        const pos = selected.value.indexOf(idx);
        if (pos >= 0) selected.value.splice(pos, 1);
        else {
          if (selected.value.length >= 2) selected.value.shift();
          selected.value.push(idx);
        }
        syncSlots();
      }
      function clearCombine() {
        if (pendingTarget.value) return;
        selected.value = [];
        gameRef.value.combineSlots = [null, null];
      }

      // 组卦：两张手牌 → 64卦牌区
      function commitCombine() {
        if (!canInteract.value || pendingTarget.value) return;
        const idxs = [...selected.value].sort((a, b) => a - b);
        if (idxs.length !== 2) return;
        const ok = combineToZone(self.value, idxs[0], idxs[1]);
        if (ok) {
          selected.value = [];
          gameRef.value.combineSlots = [null, null];
        }
      }

      // 左键：选中64卦牌准备打出（仅自己行动阶段）
      function pickHex(idx) {
        if (!isHumanTurn.value || pendingTarget.value) return;
        selectedHex.value = selectedHex.value === idx ? null : idx;
      }
      // 右键：拆回两张八卦（任意存活时间）
      function splitHex(idx) {
        if (!canInteract.value) return;
        splitHexCard(self.value, idx);
        if (selectedHex.value === idx) selectedHex.value = null;
        else if (selectedHex.value > idx) selectedHex.value -= 1;
        // 被悬停的小卦牌已从 DOM 移除，浏览器不会触发 mouseleave，需手动清空大卡牌
        hoveredHex.value = null;
      }
      // 悬停：根级 tooltip 显示大卡牌（避开 .hex-mini transform 干扰 fixed 定位）
      function onHexHover(card) { hoveredHex.value = card; }
      // 全局兜底：小卦牌被拆/打出/组卦而从 DOM 移除时，浏览器不触发其 mouseleave，
      // 会导致大卡牌残留。这里用事件委托：鼠标移到任何非小卦牌元素上即关闭。
      function onGlobalHover(e) {
        const t = e.target;
        if (t && typeof t.closest === 'function' && t.closest('.hex-mini')) return;
        hoveredHex.value = null;
      }

      // 出牌
      function executePlay(targetId) {
        if (selectedHex.value == null) return;
        playHexCard(self.value, selectedHex.value, targetId);
        selectedHex.value = null;
        pendingTarget.value = false;
        // 出牌后小卦牌被移除，同样不会触发 mouseleave，手动关闭悬停大卡牌
        hoveredHex.value = null;
      }
      function onPlay() {
        if (!isHumanTurn.value || pendingTarget.value) return;
        const reason = playBlockReason.value;
        if (reason) {
          addLog(reason);
          return;
        }
        const c = selectedHexCard.value;
        const needTarget = c.hex.effects.some(e =>
          e.target === 'single' || e.target === 'singleAndSelf'
        );
        if (needTarget) {
          pendingTarget.value = true;
          addLog('请选择目标玩家');
        } else {
          executePlay(null);
        }
      }
      function onPickTarget(id) {
        if (!pendingTarget.value) return;
        const p = gameRef.value.players[id];
        if (!p || !p.alive) return;
        executePlay(id);
      }
      function onEndTurn() {
        if (!isHumanTurn.value) return;
        endTurn();
      }
      function restart() {
        selected.value = [];
        selectedHex.value = null;
        hoveredHex.value = null;
        pendingTarget.value = false;
        Object.keys(fxMap).forEach(k => fxMap[k] = []);
        Object.keys(shakeMap).forEach(k => shakeMap[k] = '');
        initGame();
        gameRef.value = game;
      }

      // 日志自动滚底
      watch(() => gameRef.value && gameRef.value.log.length, async () => {
        await nextTick();
        if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
      });

      return {
        game: gameRef,
        players, self, rivals, slots, currentName, phaseText,
        isHumanTurn, humanShock, lifeChainText, deathChainText,
        canInteract, previewCombined,
        canPlay, playBlockReason,
        selected, selectedHex, hoveredHex, pendingTarget, fxMap, shakeMap, logBox,
        trigramYaoHTML,
        toggleCard, clearCombine, commitCombine, pickHex, splitHex, onHexHover, onGlobalHover,
        onPlay, onPickTarget, onEndTurn, restart,
      };
    },
  });

  app.mount('#app');
})();
