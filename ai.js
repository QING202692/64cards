// ====== AI 逻辑 ======
function aiTurn(player) {
  if (game.gameOver) return;
  if (!player.alive) { endTurn(); return; }

  // 1. 尝试组合并出牌（最多2张）
  let playsRemaining = 2;
  const extraPlay = player.buffs.find(b => b.buff === 'extraPlay');
  if (extraPlay) playsRemaining += 1;

  let played = 0;
  while (played < playsRemaining && player.hand.length >= 2) {
    const action = aiDecide(player);
    if (!action) break;
    playCard(player, action.combined, action.targetId);
    played++;
    if (game.gameOver) return;
  }

  // 结束回合
  setTimeout(() => {
    addLog(`${player.name} 结束回合`);
    endTurn();
  }, 500);
}

function aiDecide(player) {
  // 找出所有可打出的组合
  const playable = [];
  for (let i = 0; i < player.hand.length; i++) {
    for (let j = 0; j < player.hand.length; j++) {
      if (i === j) continue;
      const combined = previewCombine(player, i, j);
      if (!combined) continue;
      const hex = combined.hex;
      let cost = hex.cost;
      if (player.debuffs.some(d => d.debuff === 'costIncrease')) cost += 1;
      if (player.qi >= cost && !hex.isReaction) {
        playable.push({ combined, upperIdx: i, lowerIdx: j, hex, cost });
      }
    }
  }

  if (playable.length === 0) return null;

  // 简单策略：
  // 1. 血量低（<40）优先治疗/护盾
  // 2. 否则攻击血量最低的玩家
  // 3. 气不够就跳过

  // 找最优牌
  let best = null;
  let bestScore = -Infinity;

  for (const p of playable) {
    let score = 0;
    const hex = p.hex;

    // 评估效果
    const isDamage = hex.effects.some(e => e.type === 'damage');
    const isHeal = hex.effects.some(e => e.type === 'heal' && (e.target === 'self' || e.target === 'singleAndSelf'));
    const isShield = hex.effects.some(e => e.type === 'shield' && (e.target === 'self' || e.target === 'singleAndSelf'));

    if (player.hp < 40) {
      if (isHeal) score += 30;
      if (isShield) score += 20;
      if (isDamage) score -= 5;
    } else {
      if (isDamage) score += 15;
      if (isHeal) score += 5;
    }

    // 气效率
    score -= hex.cost * 2;

    // 变爻加分
    if (p.combined.isChanging) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best) return null;

  // 选目标
  let targetId = null;
  const isDamage = best.hex.effects.some(e => e.type === 'damage' && (e.target === 'single' || e.target === 'singleAndSelf'));
  if (isDamage) {
    // 打血量最低的其他玩家
    const enemies = game.players.filter(p => p.id !== player.id && p.alive);
    enemies.sort((a, b) => a.hp - b.hp);
    if (enemies.length > 0) targetId = enemies[0].id;
  } else {
    // 治疗/护盾选自己或血量最低的友方（其实没有友方，选自己）
    targetId = player.id;
  }

  // 执行组合
  const combined = combineCards(player, best.upperIdx, best.lowerIdx);
  return { combined, targetId };
}

// 预览组合（不实际移除手牌）
function previewCombine(player, upperIdx, lowerIdx) {
  const upper = player.hand[upperIdx];
  const lower = player.hand[lowerIdx];
  if (!upper || !lower) return null;

  const hex = getHexagram(upper.trigram, lower.trigram);
  if (!hex) return null;

  const hasChanging = upper.changing || lower.changing;
  let changedHex = null;
  if (hasChanging) {
    const cu = upper.changing ? getChangedKey(upper) : upper.trigram;
    const cl = lower.changing ? getChangedKey(lower) : lower.trigram;
    changedHex = getHexagram(cu, cl);
  }

  return { hex, changedHex, isChanging: hasChanging, originalUpper: upper, originalLower: lower };
}
