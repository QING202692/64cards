// ====== 游戏状态 ======
let game = null;

// UI 钩子：特效事件（扣血/破盾/治疗），由 Vue 层注入
function emitFx(fx) {
  if (typeof window !== 'undefined' && window.onFx) window.onFx(fx);
}

// buff / debuff 中文标签（战报显示用）
const BUFF_LABEL = {
  noReflect: '禁反弹', reflect: '反弹', damageReduce: '减伤',
  extraQi: '聚气', regen: '恢复', damageBonus: '增伤', extraPlay: '连出',
};
const DEBUFF_LABEL = {
  noHighCost: '封气', poison: '中毒', drawReduce: '少摸', qiReduce: '减气',
  stun: '眩晕', noDraw: '封摸', costIncrease: '耗气',
};
function buffLabel(key) { return BUFF_LABEL[key] || key; }
function debuffLabel(key) { return DEBUFF_LABEL[key] || key; }

function initGame() {
  game = {
    players: [
      createPlayer(0, '玩家', true),
      createPlayer(1, 'AI 甲', false),
      createPlayer(2, 'AI 乙', false),
      createPlayer(3, 'AI 丙', false),
    ],
    deck: createDeck(),
    discard: [],
    turn: 0,
    currentPlayer: 0,
    phase: 'draw', // draw -> combine -> action -> reaction -> settle
    playedThisTurn: [], // {playerId, card, target, effects}
    sameLifeChain: [], // 同生链
    sameDeathChain: [], // 共死链
    gameOver: false,
    winner: null,
    log: [],
    // 组合区（当前玩家正在组合的牌）
    combineSlots: [null, null], // [上卦, 下卦]
    // 反应阶段状态
    reactingTo: null,
    reactionUsed: false,
  };

  // Vue 响应式包装钩子（包装后全局 game 指向代理，所有修改自动驱动视图）
  if (typeof window !== 'undefined' && window.wrapGame) {
    game = window.wrapGame(game);
  }

  // 发起手牌
  game.players.forEach(p => {
    drawCards(p, 4);
    enforceHandLimit(p);
  });

  addLog('游戏开始！');
  startTurn(0);
}

function createPlayer(id, name, isHuman) {
  return {
    id, name, isHuman,
    hp: 100, maxHp: 100,
    qi: 2, maxQi: 10,
    shield: 0,
    hand: [],
    hexCards: [], // 64卦牌区：预组好的卦牌（随时可组/可拆）
    buffs: [],
    debuffs: [],
    alive: true,
    playedThisTurn: false,
    skipDraw: false,
    skipAction: false,
    skipReaction: false,
    extraPlay: 0,
    lastPlayedCard: null,
    attackedThisTurn: [], // 本回合攻击过我的玩家
  };
}

// ====== 牌库 ======
function createDeck() {
  const deck = [];
  for (const tri of TRIGRAMS) {
    // 12 张普通
    for (let i = 0; i < 12; i++) {
      deck.push({ trigram: tri, changing: null });
    }
    // 3 张变爻（上中下各1）
    deck.push({ trigram: tri, changing: 'upper' });
    deck.push({ trigram: tri, changing: 'middle' });
    deck.push({ trigram: tri, changing: 'lower' });
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCards(player, count) {
  for (let i = 0; i < count; i++) {
    if (game.deck.length === 0) {
      // 洗弃牌堆
      if (game.discard.length === 0) break;
      game.deck = shuffle(game.discard);
      game.discard = [];
      addLog('牌库耗尽，弃牌堆洗回');
    }
    if (game.deck.length === 0) break;
    player.hand.push(game.deck.pop());
  }
}

function getHandCapacity(player) {
  const base = Math.floor(player.hp / 10);
  if (player.hp <= 30) return base + 3;
  return base;
}

function enforceHandLimit(player) {
  const cap = getHandCapacity(player);
  let usage = 0;
  // 8卦0.5，64卦1（本游戏手牌都是8卦牌，组合后才出）
  usage = player.hand.length * 0.5;
  while (usage > cap && player.hand.length > 0) {
    // 弃第一张（原型简化，玩家自选需要UI）
    if (player.isHuman) {
      // 人类玩家由UI处理弃牌
      break;
    }
    const discarded = player.hand.shift();
    game.discard.push(discarded);
    usage -= 0.5;
  }
}

// ====== 组合 ======
// 由两张8卦牌生成64卦组合对象（不移除手牌）
function makeCombined(upper, lower) {
  if (!upper || !lower) return null;

  // 生成64卦
  const hex = getHexagram(upper.trigram, lower.trigram);
  if (!hex) return null;

  const hasChanging = upper.changing || lower.changing;
  let changedHex = null;
  if (hasChanging) {
    const cu = upper.changing ? getChangedKey(upper) : upper.trigram;
    const cl = lower.changing ? getChangedKey(lower) : lower.trigram;
    changedHex = getHexagram(cu, cl);
  }

  return {
    hex,
    changedHex,
    isChanging: hasChanging,
    originalUpper: upper,
    originalLower: lower,
  };
}

function combineCards(player, upperIdx, lowerIdx) {
  const upper = player.hand[upperIdx];
  const lower = player.hand[lowerIdx];
  if (!upper || !lower) return null;

  const combined = makeCombined(upper, lower);
  if (!combined) return null;

  // 移除手牌
  player.hand.splice(Math.max(upperIdx, lowerIdx), 1);
  player.hand.splice(Math.min(upperIdx, lowerIdx), 1);

  return combined;
}

// 预组：两张手牌 → 64卦牌区（玩家存活时任意时间可用）
function combineToZone(player, upperIdx, lowerIdx) {
  const upper = player.hand[upperIdx];
  const lower = player.hand[lowerIdx];
  if (!upper || !lower) return false;

  const combined = makeCombined(upper, lower);
  if (!combined) return false;

  player.hand.splice(Math.max(upperIdx, lowerIdx), 1);
  player.hand.splice(Math.min(upperIdx, lowerIdx), 1);
  player.hexCards.push(combined);
  addLog(`${player.name} 组卦【${combined.hex.name}】存入卦牌区`);
  return true;
}

// 拆解：64卦牌区 → 两张8卦回手牌（右键）
function splitHexCard(player, zoneIdx) {
  const combined = player.hexCards[zoneIdx];
  if (!combined) return false;
  player.hexCards.splice(zoneIdx, 1);
  player.hand.push(combined.originalUpper, combined.originalLower);
  addLog(`${player.name} 拆解【${combined.hex.name}】为两张8卦`);
  return true;
}

// 从64卦牌区出牌
function playHexCard(player, zoneIdx, targetId) {
  const combined = player.hexCards[zoneIdx];
  if (!combined) return false;
  const ok = playCard(player, combined, targetId);
  if (ok) player.hexCards.splice(zoneIdx, 1);
  return ok;
}

// ====== 出牌 ======
function playCard(player, combined, targetId) {
  const hex = combined.hex;
  let cost = hex.cost;

  // 水泽节：所有玩家出牌消耗+1
  if (player.debuffs.some(d => d.debuff === 'costIncrease')) {
    cost += 1;
  }
  // 山水蒙/坎为水：无法打出≥X气卡牌
  const noHigh = player.debuffs.find(d => d.debuff === 'noHighCost');
  if (noHigh && cost >= noHigh.value) {
    addLog(`${player.name} 受封，无法打出 ${cost} 气以上的牌`);
    return false;
  }

  if (player.qi < cost) {
    addLog(`${player.name} 气不足`);
    return false;
  }
  player.qi -= cost;

  const targetName = (targetId != null && game.players[targetId]) ? game.players[targetId].name : '无';
  addLog(`${player.name} 打出【${hex.name}】${combined.isChanging ? '(变爻)' : ''}，目标：${targetName}`);

  // 执行效果
  executeEffects(player, hex.effects, targetId, combined.isChanging, combined.changedHex);

  player.playedThisTurn = true;
  player.lastPlayedCard = { hex, targetId };

  // 记录出牌
  game.playedThisTurn.push({ playerId: player.id, hex, targetId, changing: combined.isChanging });

  // 弃牌
  game.discard.push(combined.originalUpper, combined.originalLower);

  // 检查同生共死链
  checkSpecialEnding(player, hex);

  return true;
}

function executeEffects(player, effects, targetId, isChanging, changedHex) {
  for (let eff of effects) {
    if (isChanging) {
      // 变爻：效果数值对半
      eff = { ...eff, value: eff.value ? Math.floor(eff.value / 2) : eff.value };
    }

    switch (eff.type) {
      case 'damage':
        applyDamage(player, eff, targetId);
        break;
      case 'heal':
        applyHeal(player, eff, targetId);
        break;
      case 'shield':
        applyShield(player, eff, targetId);
        break;
      case 'draw':
        drawCards(player, eff.value);
        enforceHandLimit(player);
        addLog(`${player.name} 抽了 ${eff.value} 张牌`);
        break;
      case 'buff':
        player.buffs.push({ buff: eff.buff, value: eff.value || 0, duration: eff.duration });
        addLog(`${player.name} 获得 ${buffLabel(eff.buff)}`);
        break;
      case 'debuff':
        applyDebuff(player, eff, targetId);
        break;
      case 'special':
        executeSpecial(player, eff, targetId);
        break;
    }
  }

  // 变爻追加变卦效果
  if (isChanging && changedHex) {
    addLog(`变卦效果【${changedHex.name}】同时生效`);
    for (let eff of changedHex.effects) {
      eff = { ...eff, value: eff.value ? Math.floor(eff.value / 2) : eff.value };
      // 变卦效果目标默认和本卦相同
      switch (eff.type) {
        case 'damage': applyDamage(player, eff, targetId); break;
        case 'heal': applyHeal(player, eff, targetId); break;
        case 'shield': applyShield(player, eff, targetId); break;
        case 'draw': drawCards(player, eff.value); enforceHandLimit(player); break;
        case 'buff': player.buffs.push({ buff: eff.buff, value: eff.value || 0, duration: eff.duration }); break;
        case 'debuff': applyDebuff(player, eff, targetId); break;
        case 'special': executeSpecial(player, eff, targetId); break;
      }
    }
  }
}

function applyDamage(attacker, eff, targetId) {
  // 全体其他玩家：逐个走单体结算（不含攻击者本人）
  if (eff.target === 'allOthers') {
    game.players.forEach(p => {
      if (p.id !== attacker.id && p.alive) {
        applyDamage(attacker, { ...eff, target: 'single' }, p.id);
      }
    });
    return;
  }

  const target = game.players[targetId];
  if (!target || !target.alive) return;

  let dmg = eff.value;

  // 附加伤害
  if (eff.bonus) {
    switch (eff.bonus.type) {
      case 'hpLess30': if (target.hp < 30) dmg += eff.bonus.value; break;
      case 'hpLessEq20': if (target.hp <= 20) dmg += eff.bonus.value; break;
      case 'hasShield': if (target.shield > 0) dmg += eff.bonus.value; break;
      case 'selfHpMore70': if (attacker.hp > 70) dmg += eff.bonus.value; break;
      case 'selfHpLess50': if (attacker.hp < 50) dmg += eff.bonus.value; break;
      case 'attackedMe': if (target.attackedThisTurn.includes(attacker.id)) dmg += eff.bonus.value; break;
      case 'perAlive': {
        const alive = game.players.filter(p => p.alive).length;
        dmg += eff.bonus.value * alive;
        break;
      }
    }
  }

  // 攻击者伤害加成
  const dmgBuff = attacker.buffs.find(b => b.buff === 'damageBonus');
  if (dmgBuff) dmg += dmgBuff.value;

  // 雷泽归妹：已出牌减半
  if (eff.condition === 'ifAlreadyPlayedHalf' && attacker.playedThisTurn) {
    dmg = Math.floor(dmg / 2);
  }

  // 目标减伤
  const reduce = target.buffs.find(b => b.buff === 'damageReduce');
  if (reduce) dmg = Math.max(0, dmg - reduce.value);

  // 先扣护盾
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
    emitFx({ type: 'shieldHit', id: target.id, amount: absorbed });
    if (target.shield <= 0) emitFx({ type: 'shieldBreak', id: target.id });
  }

  target.hp -= dmg;
  target.attackedThisTurn.push(attacker.id);

  if (dmg > 0) emitFx({ type: 'damage', id: target.id, amount: dmg });

  // 吸血
  if (eff.lifesteal) {
    const heal = Math.floor(dmg * eff.lifesteal);
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    if (heal > 0) emitFx({ type: 'heal', id: attacker.id, amount: heal });
  }

  addLog(`${target.name} 受到 ${dmg} 伤害`);

  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    emitFx({ type: 'dead', id: target.id });
    addLog(`${target.name} 出局！`);
    checkGameOver();
  }
}

function applyHeal(player, eff, targetId) {
  const healTo = (t, val) => {
    if (!t || !t.alive) return;
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + val);
    const real = t.hp - before;
    if (real > 0) emitFx({ type: 'heal', id: t.id, amount: real });
  };

  if (eff.target === 'self') {
    healTo(player, eff.value);
    addLog(`${player.name} 恢复 HP`);
  } else if (eff.target === 'single') {
    healTo(game.players[targetId], eff.value);
  } else if (eff.target === 'singleAndSelf') {
    healTo(player, eff.value);
    healTo(game.players[targetId], eff.value);
  } else if (eff.target === 'all') {
    game.players.forEach(p => healTo(p, eff.value));
    addLog(`全体恢复 HP`);
  }
}

function applyShield(player, eff, targetId) {
  let val = eff.value;
  // 水雷屯：HP<40护盾翻倍
  if (eff.condition === 'hpLess40Double' && player.hp < 40) val *= 2;

  const shieldTo = (t) => {
    if (!t || !t.alive) return;
    t.shield += val;
    emitFx({ type: 'shieldGain', id: t.id, amount: val });
  };

  if (eff.target === 'self') {
    shieldTo(player);
    addLog(`${player.name} 获得 ${val} 护盾`);
  } else if (eff.target === 'singleAndSelf') {
    shieldTo(player);
    shieldTo(game.players[targetId]);
    addLog(`${player.name} 与目标各获得 ${val} 护盾`);
  } else if (eff.target === 'all') {
    game.players.forEach(p => { if (p.alive) p.shield += val; });
    addLog(`全体获得 ${val} 护盾`);
  } else if (eff.target === 'single') {
    const t = game.players[targetId];
    if (t && t.alive) {
      t.shield += val;
      addLog(`${t.name} 获得 ${val} 护盾`);
    }
  }
}

function applyDebuff(player, eff, targetId) {
  if (eff.target === 'single') {
    const t = game.players[targetId];
    if (t && t.alive) {
      t.debuffs.push({ debuff: eff.debuff, value: eff.value || 0, duration: eff.duration });
      addLog(`${t.name} 受到 ${debuffLabel(eff.debuff)}`);
    }
  } else if (eff.target === 'all') {
    game.players.forEach(p => {
      if (p.alive) p.debuffs.push({ debuff: eff.debuff, value: eff.value || 0, duration: eff.duration });
    });
  }
}

function executeSpecial(player, eff, targetId) {
  switch (eff.action) {
    case 'clearShieldSingle': {
      const t = game.players[targetId];
      if (t) {
        addLog(`${t.name} 的 ${t.shield} 护盾被清除`);
        t.shield = 0;
      }
      break;
    }
    case 'clearShieldAllOthers': {
      game.players.forEach(p => {
        if (p.id !== player.id && p.alive) {
          p.shield = 0;
        }
      });
      addLog('全体其他玩家护盾被清除');
      break;
    }
    case 'endTurn':
      addLog(`${player.name} 结束回合`);
      break;
    case 'immune':
      // 反应阶段处理
      break;
    case 'immuneHalf':
      break;
    case 'copyLastLowCost':
      addLog('（复制效果暂未实现）');
      break;
  }
}

// ====== 特殊结局 ======
const SAME_LIFE_SEQ = [
  ['乾为天', '坤为地', '地天泰'],
  ['坎为水', '离为火', '水火既济'],
];
const SAME_DEATH_SEQ = [
  ['坤为地', '乾为天', '天地否'],
  ['离为火', '坎为水', '火水未济'],
];

function checkSpecialEnding(player, hex) {
  const alive = game.players.filter(p => p.alive);
  if (alive.length !== 3) return;

  // 同生
  for (const seq of SAME_LIFE_SEQ) {
    if (hex.name === seq[game.sameLifeChain.length]) {
      game.sameLifeChain.push(hex.name);
      if (game.sameLifeChain.length === 3) {
        game.gameOver = true;
        game.winner = 'sameLife';
        addLog('【同生】天下归心，安居乐业！3 人共享胜利！');
        return;
      }
    } else {
      game.sameLifeChain = [];
    }
  }
  // 共死
  for (const seq of SAME_DEATH_SEQ) {
    if (hex.name === seq[game.sameDeathChain.length]) {
      game.sameDeathChain.push(hex.name);
      if (game.sameDeathChain.length === 3) {
        game.gameOver = true;
        game.winner = 'sameDeath';
        addLog('【共死】生灵涂炭，没有赢家！');
        return;
      }
    } else {
      game.sameDeathChain = [];
    }
  }
}

function checkGameOver() {
  const alive = game.players.filter(p => p.alive);
  if (alive.length === 1) {
    game.gameOver = true;
    game.winner = alive[0].id;
    addLog(`游戏结束！${alive[0].name} 获胜！`);
  } else if (alive.length === 0) {
    game.gameOver = true;
    game.winner = 'none';
    addLog('游戏结束！无人生还！');
  }
}

// ====== 回合流程 ======
function startTurn(playerId) {
  if (game.gameOver) return;
  const p = game.players[playerId];
  if (!p.alive) {
    nextTurn();
    return;
  }

  game.currentPlayer = playerId;
  p.playedThisTurn = false;
  p.attackedThisTurn = [];
  p.extraPlay = 0;
  p.skipDraw = false;
  p.skipAction = false;
  p.skipReaction = false;
  game.combineSlots = [null, null];

  // 回合开始：处理buff/debuff持续时间
  p.buffs = p.buffs.map(b => ({ ...b, duration: b.duration - 1 })).filter(b => b.duration > 0);
  p.debuffs = p.debuffs.map(d => ({ ...d, duration: d.duration - 1 })).filter(d => d.duration > 0);

  // 回血（雷风恒）
  const regen = p.buffs.find(b => b.buff === 'regen');
  if (regen) {
    p.hp = Math.min(p.maxHp, p.hp + regen.value);
  }

  // 回气
  let qiGain = 2;
  if (p.hp <= 30) qiGain = 4;
  const extra = p.buffs.find(b => b.buff === 'extraQi');
  if (extra) qiGain += extra.value;
  p.qi = Math.min(p.maxQi, p.qi + qiGain);

  // 眩晕处理
  const stun = p.debuffs.find(d => d.debuff === 'stun');
  if (stun) {
    addLog(`${p.name} 被眩晕，跳过摸牌和行动`);
    p.skipAction = true;
    p.skipReaction = true;
  }

  // 摸牌阶段
  game.phase = 'draw';
  if (p.skipDraw) {
    addLog(`${p.name} 无法摸牌`);
    p.skipDraw = false;
  } else {
    let drawCount = 2;
    const drawReduce = p.debuffs.find(d => d.debuff === 'drawReduce');
    if (drawReduce) drawCount = Math.max(0, drawCount - drawReduce.value);
    if (!p.debuffs.find(d => d.debuff === 'noDraw')) {
      drawCards(p, drawCount);
    }
    // 保证至少2张
    while (p.hand.length < 2 && (game.deck.length > 0 || game.discard.length > 0)) {
      drawCards(p, 1);
    }
  }

  enforceHandLimit(p);

  if (p.skipAction) {
    p.skipAction = false;
    endTurn();
    return;
  }

  game.phase = 'action';
  addLog(`--- ${p.name} 的回合 ---`);

  if (!p.isHuman) {
    setTimeout(() => aiTurn(p), 800);
  }
}

function endTurn() {
  // 本回合出牌记录清空
  game.playedThisTurn = [];
  game.reactionUsed = false;
  // 下一位玩家
  nextTurn();
}

function nextTurn() {
  let next = (game.currentPlayer + 1) % 4;
  let attempts = 0;
  while (!game.players[next].alive && attempts < 4) {
    next = (next + 1) % 4;
    attempts++;
  }
  game.turn++;
  startTurn(next);
}

function addLog(msg) {
  game.log.push(msg);
  if (game.log.length > 100) game.log.shift();
}
