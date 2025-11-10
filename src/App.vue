<template>
  <div id="app" class="wrap">
    <h1>🔐탈자봉 비밀 마니또 (Vue 3 • 암호 기반 • 사회자 없음)</h1>
    <p class="lead">
      1) 각자 이름과 <b>본인만 아는 암호</b> 등록 → 2) 마지막 사람이 <b>완료/잠금</b> →
      3) 각자 <b>자기 암호로 결과 조회</b>
    </p>

    <div class="grid">
      <!-- 등록 카드 -->
      <section class="card">
        <h2>① 참가자 등록</h2>
        <div class="row">
          <div>
            <label>이름</label>
            <input
              v-model.trim="name"
              :disabled="locked || sharedMode"
              type="text"
              placeholder="예: 지현"
              @keydown.enter="addParticipant"
            />
          </div>
          <div>
            <label>암호 (본인만 알기)</label>
            <input
              v-model.trim="code"
              :disabled="locked || sharedMode"
              type="text"
              class="mono"
              placeholder="예: 31 (생일 끝 두 자리 등)"
              @keydown.enter="addParticipant"
            />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" @click="addParticipant" :disabled="locked || sharedMode">+ 등록</button>
          <button class="btn warn" @click="clearAll" :disabled="sharedMode">초기화</button>
          <button
            class="btn primary"
            @click="lockAndAssign"
            :disabled="locked || sharedMode"
            title="모든 등록이 끝났다면 클릭하여 배정 확정"
          >
            완료 / 잠금
          </button>
        </div>
        <div class="hr"></div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="pill">{{ participants.length }}명 등록됨</span>
          <span class="muted">
            {{ sharedMode ? '공유 링크 모드 (읽기 전용)' : (locked ? '현재: 잠금됨' : '현재: 등록 중') }}
          </span>
        </div>
        <ul>
          <li v-for="(p, idx) in participants" :key="p.code">
            <div>{{ idx + 1 }}. {{ p.name }}</div>
            <div><span class="pill">암호 ••••</span></div>
          </li>
        </ul>
        <p class="muted">※ 암호는 화면에 <b>표시되지 않습니다</b>. 이름/암호는 중복될 수 없습니다.</p>

        <!-- 공유 링크 -->
        <div v-if="locked && !sharedMode" class="hr"></div>
        <div v-if="locked && !sharedMode" class="row">
          <button class="btn" @click="makeShareLink">공유 링크 만들기</button>
          <button class="btn" @click="copyShareLink" :disabled="!shareLink">링크 복사</button>
        </div>
        <div v-if="shareLink" style="margin-top:8px">
          <label>공유 링크 (모두에게 이 URL만 보내면, 각자 자신의 암호로 결과를 볼 수 있어요)</label>
          <input :value="shareLink" readonly class="mono" />
          <p class="muted">보안 팁: 2자리 숫자보단 <b>4~6자 이상</b>을 권장합니다.</p>
        </div>
      </section>

      <!-- 결과 확인 카드 -->
      <section class="card">
        <h2>② 내 결과 확인</h2>
        <label>내 암호 입력</label>
        <input
          v-model.trim="myCode"
          type="text"
          class="mono"
          placeholder="내 암호를 입력하세요"
          @keydown.enter="reveal"
        />
        <div class="row" style="margin-top:10px">
          <button class="btn primary" @click="reveal">내 결과 보기</button>
          <button class="btn" @click="hideResult">숨기기</button>
        </div>
        <div class="hr"></div>
        <div class="big" v-html="resultHtml"></div>
        <p class="muted">
          {{ locked ? '이제 각자 자신의 암호로 결과를 확인하세요.' : '잠금 전에는 결과를 볼 수 없습니다. 모든 등록 후 "완료 / 잠금"을 누르세요.' }}
        </p>

        <!-- (선택) 개별 미리채움 링크 -->
        <!-- <div v-if="locked && !sharedMode" class="hr"></div>
        <div v-if="locked && !sharedMode">
          <h3 style="margin:8px 0 6px;font-size:16px">개별 링크 (선택)</h3>
          <p class="muted">참가자에게 자신의 암호가 미리 채워진 URL을 보내고 싶다면 아래 목록을 사용하세요.</p>
          <ul>
            <li v-for="p in participants" :key="p.code" style="flex-direction:column;align-items:flex-start">
              <div class="mono">{{ p.name }} → ?code={{ p.code }}</div>
              <input :value="makePrefillLink(p.code)" readonly class="mono" />
            </li>
          </ul>
        </div> -->
      </section>
    </div>

    <div class="footer">
      ⚙️ 이 페이지는 <b>정적 호스팅</b>(예: GitHub Pages)으로 배포해 공유할 수 있습니다. 공유 링크 모드에서는 등록·수정이 불가합니다.
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'

const LS_KEY = 'secret-santa-vue3-state-v1.1'

// util: URL & base64
const url = new URL(location.href)
const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''))
const q = url.searchParams

const b64Encode = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
const b64DecodeToObj = (s) => {
  try { return JSON.parse(decodeURIComponent(escape(atob(s)))) } catch (e) { return null }
}

// state
const phase = ref('register')           // 'register' | 'locked'
const participants = reactive([])       // { name, code }
const assignments = reactive({})        // code -> targetName
const name = ref('')
const code = ref('')
const myCode = ref(q.get('code') || '')
const resultHtml = ref('')
const shareLink = ref('')
const sharedMode = ref(false)

const locked = computed(() => phase.value === 'locked')

// restore (shared link first)
const sharedData = hashParams.get('s')
if (sharedData) {
  const payload = b64DecodeToObj(sharedData)
  if (payload && payload.assignments && payload.participants) {
    sharedMode.value = true
    phase.value = 'locked'
    payload.participants.forEach(p => participants.push({ name: p.name, code: '(hidden)' })) // 코드 감춤
    Object.assign(assignments, payload.assignments)
  }
}
if (!sharedMode.value) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      phase.value = s.phase || 'register'
      ;(s.participants || []).forEach(p => participants.push(p))
      Object.assign(assignments, s.assignments || {})
    }
  } catch {}
}

// persist (only non-shared)
const persist = () => {
  if (sharedMode.value) return
  localStorage.setItem(LS_KEY, JSON.stringify({
    phase: phase.value,
    participants: participants,
    assignments: assignments
  }))
}
watch(participants, persist, { deep: true })
watch(phase, persist)
watch(assignments, persist, { deep: true })

const trim = (s) => (s ?? '').toString().trim()

function addParticipant () {
  if (locked.value || sharedMode.value) { alert('등록을 할 수 없습니다.'); return }
  const n = trim(name.value)
  const c = trim(code.value)
  if (!n || !c) { alert('이름과 암호를 모두 입력하세요.'); return }
  if (participants.find(p => p.name === n)) { alert('이름이 중복됩니다. 다른 표시명을 사용하세요.'); return }
  if (participants.find(p => p.code === c)) { alert('암호가 중복됩니다. 각자 고유한 암호를 사용하세요.'); return }
  participants.push({ name: n, code: c })
  name.value = ''; code.value = ''
}

function clearAll () {
  if (sharedMode.value) { alert('공유 링크 모드에서는 초기화할 수 없습니다.'); return }
  if (!confirm('정말 초기화할까요? 모든 등록/배정 정보가 삭제됩니다.')) return
  localStorage.removeItem(LS_KEY)
  location.href = location.pathname // 쿼리/해시 제거
}

// Sattolo cycle (단일 사이클 → 자기 자신 불가)
function sattoloCycle (arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i) // 0..i-1
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function lockAndAssign () {
  if (locked.value || sharedMode.value) return
  const n = participants.length
  if (n < 2) { alert('최소 2명 이상이 필요합니다.'); return }
  const names = participants.map(p => p.name)
  const targets = sattoloCycle(names)
  const map = {}
  participants.forEach((p, i) => { map[p.code] = targets[i] })
  Object.keys(assignments).forEach(k => delete assignments[k])
  Object.assign(assignments, map)
  phase.value = 'locked'
  alert('배정이 완료되었습니다! 이제 각자 자신의 암호로 결과를 확인하세요. 공유 링크를 만들어 모두에게 전송할 수 있습니다.')
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))

function reveal () {
  if (!locked.value) { alert('아직 잠금되지 않았습니다. 모든 등록 후 "완료 / 잠금"을 누르세요.'); return }
  const c = trim(myCode.value)
  if (!c) { alert('암호를 입력하세요.'); return }
  const target = assignments[c]
  if (!target) { resultHtml.value = '<span class="danger">해당 암호가 없습니다. 다시 확인해 주세요.</span>'; return }
  resultHtml.value = `🎁 <b>당신의 마니또는 <span class="success">${escapeHtml(target)}</span> 입니다!</b>`
}
function hideResult () { resultHtml.value = '' }

function makeShareLink () {
  if (!locked.value) { alert('먼저 잠금이 필요합니다.'); return }
  const payload = {
    participants: participants.map(p => ({ name: p.name })), // 코드 비공개
    assignments: assignments
  }
  const encoded = b64Encode(payload)
  const base = location.origin + location.pathname
  shareLink.value = `${base}#s=${encoded}`
}

async function copyShareLink () {
  if (!shareLink.value) return
  try {
    await navigator.clipboard.writeText(shareLink.value)
    alert('공유 링크가 복사되었습니다!')
  } catch {
    prompt('아래 링크를 복사하세요:', shareLink.value)
  }
}

function makePrefillLink (code) {
  const base = shareLink.value || (location.origin + location.pathname + location.hash)
  const u = new URL(base, location.href)
  u.searchParams.set('code', code)
  return u.toString()
}
</script>

<style>
:root { --bg:#0f172a; --card:#111827; --muted:#94a3b8; --text:#e5e7eb; --accent:#22d3ee; --danger:#f97316; }
*{box-sizing:border-box}
body{margin:0;background:linear-gradient(180deg,#0b1220,#111827);font-family:system-ui,-apple-system,Segoe UI,Roboto,Apple SD Gothic Neo,Noto Sans KR,sans-serif;color:var(--text)}
.wrap{max-width:920px;margin:40px auto;padding:20px}
h1{font-size:26px;margin:0 0 12px}
p.lead{color:var(--muted);margin:0 0 18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:18px;border-radius:16px;backdrop-filter: blur(6px)}
.card h2{font-size:18px;margin:0 0 12px}
label{display:block;font-size:13px;color:#cbd5e1;margin:8px 0 6px}
input,button,textarea,select{font:inherit}
input[type="text"], .mono {
  width:100%;padding:12px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:var(--text);
}
input::placeholder{color:#8391a6}
.row{display:flex;gap:10px}
.row>div{flex:1}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:#0b1220;color:var(--text);cursor:pointer}
.btn.primary{background:linear-gradient(90deg,#06b6d4,#22d3ee);color:#0b1220;border:none;font-weight:700}
.btn.warn{background:#1b0e05;color:#ffd7b5;border:1px solid #ef9449}
.btn:disabled{opacity:.55;cursor:not-allowed}
ul{list-style:none;padding:0;margin:10px 0 0}
li{padding:8px 10px;border:1px dashed rgba(255,255,255,0.15);border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.pill{font-size:12px;color:#94a3b8;border:1px solid rgba(255,255,255,0.18);padding:3px 8px;border-radius:999px;background:rgba(255,255,255,0.05)}
.muted{color:var(--muted)}
.success{color:#a7f3d0}
.danger{color:#fca5a5}
.hr{height:1px;background:rgba(255,255,255,0.08);margin:14px 0}
.footer{margin-top:18px;color:#64748b;font-size:12px}
.big{font-size:20px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
</style>