/**
 * PTY Host — 通常のNode.jsプロセスとして動作し、
 * Electronメインプロセスとstdin/stdoutのJSON IPCで通信する。
 * node-ptyはElectron内では posix_spawnp が失敗するため、
 * 別プロセスで実行する必要がある。
 */
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.env.FREEE_DATA_ROOT || path.resolve(__dirname, '..');

function findShell() {
  const candidates = [
    process.env.SHELL,
    '/usr/local/bin/zsh',
    '/bin/zsh',
    '/usr/local/bin/bash',
    '/bin/bash',
  ];
  for (const sh of candidates) {
    if (sh && fs.existsSync(sh)) return sh;
  }
  return '/bin/sh';
}

let ptyProcess = null;

function spawnPty(cols, rows) {
  if (ptyProcess) {
    try { ptyProcess.kill(); } catch {}
  }

  const shell = findShell();
  // CLAUDECODE がセットされている = 別の Claude Code セッション内から起動
  // → claude の自動起動をスキップし、リソース競合を回避する
  const isNested = !!(process.env.CLAUDECODE || process.env.CLAUDE_CODE);
  const env = { ...process.env, TERM: 'xterm-256color' };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE;

  ptyProcess = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cwd: ROOT_DIR,
    env,
    cols: cols || 80,
    rows: rows || 24,
  });

  // 本番利用時のみ claude を自動起動、ネスト時はシェルのみ
  setTimeout(() => {
    if (ptyProcess && !isNested) {
      ptyProcess.write('claude\n');
    }
  }, 500);

  ptyProcess.onData((data) => {
    send({ type: 'data', data });
  });

  ptyProcess.onExit(({ exitCode }) => {
    send({ type: 'exit', exitCode });
    // 自動再spawn
    setTimeout(() => spawnPty(cols, rows), 1000);
  });

  send({ type: 'spawned', pid: ptyProcess.pid });
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// stdin からのコマンドを受信
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.substring(0, newlineIdx);
    buffer = buffer.substring(newlineIdx + 1);
    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch {}
  }
});

function handleMessage(msg) {
  switch (msg.type) {
    case 'spawn':
      spawnPty(msg.cols, msg.rows);
      break;
    case 'input':
      if (ptyProcess) ptyProcess.write(msg.data);
      break;
    case 'resize':
      if (ptyProcess && msg.cols > 0 && msg.rows > 0) {
        try { ptyProcess.resize(msg.cols, msg.rows); } catch {}
      }
      break;
    case 'kill':
      if (ptyProcess) {
        try { ptyProcess.kill(); } catch {}
        ptyProcess = null;
      }
      break;
  }
}

send({ type: 'ready' });
