<template>
  <div class="wrap">
    <h1>🎁탈자봉 마니또 뽑기</h1>

    <!-- 방 ID 설정 -->
    <section v-if="!roomId">
      <h2>새로운 마니또 방 만들기</h2>
      <button :disabled="busy" @click="createRoom">
        {{ busy ? '생성 중...' : '방 만들기' }}
      </button>
    </section>

    <section v-else>
      <h2>방 ID: {{ roomId }}</h2>

      <div v-if="!locked">
        <p>참여자 정보를 입력하고 암호를 등록하세요!</p>
        <input v-model="name" placeholder="이름" @keydown.enter="registerUser" />
        <input v-model="code" placeholder="암호" type="password" @keydown.enter="registerUser" />
        <button :disabled="busy" @click="registerUser">
          {{ busy ? '등록 중...' : '등록' }}
        </button>

        <h3>참여자 목록</h3>
        <ul>
          <li v-for="p in participants" :key="p.name">{{ p.name }}</li>
        </ul>

        <button
          :disabled="busy || participants.length < 3"
          @click="lockRoom"
          style="margin-top:10px"
          title="3명 이상일 때만 가능"
        >
          {{ busy ? '배정 중...' : '완료 (잠금)' }}
        </button>
      </div>

      <div v-else>
        <p>마니또 방이 잠겼습니다 🔒</p>
        <input v-model="myCode" placeholder="내 암호 입력" type="password" @keydown.enter="revealManito" />
        <button :disabled="busy" @click="revealManito">
          {{ busy ? '조회 중...' : '내 마니또 확인' }}
        </button>

        <div v-if="result">
          <h3>당신의 마니또는...</h3>
          <p style="font-size:20px;font-weight:bold;">🎅 {{ result }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { supabase } from './lib/supabase'
import { sha256 } from './lib/crypto'
import type { Database } from './types/database'

type Participant = Database['public']['Tables']['participants']['Row']
type Assignment  = Database['public']['Tables']['assignments']['Row']

const roomId = ref('')
const locked = ref(false)
const participants = reactive<Participant[]>([])
const name = ref(''); const code = ref('')
const myCode = ref(''); const result = ref('')
const busy = ref(false)

onMounted(async () => {
  const url = new URL(location.href)
  const room = url.searchParams.get('room')
  if (room) {
    roomId.value = room
    await loadParticipants()
  }
})

async function createRoom() {
  if (!supabase) { alert('Supabase 설정 필요(.env.local)'); return }
  try {
    busy.value = true
    const id = Math.random().toString(36).slice(2, 8)
    roomId.value = id

    // ✅ 배열로 insert, 타입 자동 추론
    const { error } = await supabase
      .from('rooms')
      .insert([{ room_id: id, locked: false }])

    if (error) throw error

    const u = new URL(location.href)
    u.searchParams.set('room', id)
    history.replaceState(null, '', u)
  } catch (e:any) {
    console.error(e); alert('방 생성 실패: ' + (e?.message || e))
  } finally {
    busy.value = false
  }
}


async function registerUser() {
  if (!supabase) { alert('Supabase 설정 필요(.env.local)'); return }
  const n = name.value.trim()
  const c = code.value.trim()
  if (!n || !c) { alert('이름/암호를 입력하세요.'); return }
  if (participants.find(p => p.name === n)) { alert('이미 등록된 이름입니다.'); return }

  try {
    busy.value = true
    const hash = await sha256(c)
    const { error } = await supabase.from('participants').insert({
      room_id: roomId.value, name: n, code_hash: hash
    })
    if (error) throw error
    name.value = ''; code.value = ''
    await loadParticipants()
  } catch (e:any) {
    console.error(e); alert('등록 실패: ' + (e?.message || e))
  } finally {
    busy.value = false
  }
}

async function loadParticipants() {
  if (!supabase) return
  try {
    busy.value = true
    // 방 상태
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('locked')
      .eq('room_id', roomId.value)
      .maybeSingle()
    if (roomErr) throw roomErr
    locked.value = !!room?.locked

    // 참여자 목록
    const { data: users, error } = await supabase
      .from('participants')
      .select('name, code_hash')
      .eq('room_id', roomId.value)
    if (error) throw error

    participants.splice(0, participants.length, ...(users ?? []))
  } catch (e:any) {
    console.error(e); alert('목록 로드 실패: ' + (e?.message || e))
  } finally {
    busy.value = false
  }
}

function sattolo(names: string[]) {
  const a = names.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i) // 0..i-1
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function lockRoom() {
  if (!supabase) { alert('Supabase 설정 필요(.env.local)'); return }
  if (participants.length < 3) { alert('3명 이상만 가능합니다.'); return }

  try {
    busy.value = true
    const names = participants.map(p => p.name)
    const targets = sattolo(names) // 자기자신 배정 방지

    const rows: Assignment[] = participants.map((giver, i) => ({
      room_id: roomId.value,
      code_hash: giver.code_hash,
      target_name: targets[i],
    }))

    const { error: e1 } = await supabase.from('assignments').upsert(rows, { onConflict: 'room_id,code_hash' })
    if (e1) throw e1

    const { error: e2 } = await supabase.from('rooms').update({ locked: true }).eq('room_id', roomId.value)
    if (e2) throw e2

    locked.value = true
    alert('배정 완료! 이제 각자 암호로 결과를 확인하세요.')
  } catch (e:any) {
    console.error(e); alert('배정/잠금 실패: ' + (e?.message || e))
  } finally {
    busy.value = false
  }
}

async function revealManito() {
  if (!supabase) { alert('Supabase 설정 필요(.env.local)'); return }
  const c = myCode.value.trim()
  if (!c) { alert('암호를 입력하세요.'); return }
  if (!locked.value) { alert('아직 잠금 전입니다.'); return }

  try {
    busy.value = true
    const hash = await sha256(c)
    const { data, error } = await supabase
      .from('assignments')
      .select('target_name')
      .eq('room_id', roomId.value)
      .eq('code_hash', hash)
      .maybeSingle()

    if (error) throw error
    if (!data) { alert('등록되지 않은 암호입니다.'); return }

    result.value = data.target_name
  } catch (e:any) {
    console.error(e); alert('조회 실패: ' + (e?.message || e))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.wrap {
  max-width: 600px;
  margin: 0 auto;
  padding: 32px;
  font-family: system-ui;
}
input {
  display: block;
  margin-bottom: 8px;
  padding: 8px;
  width: 100%;
  box-sizing: border-box;
}
button {
  margin-top: 4px;
  padding: 8px 12px;
  border: none;
  background: #3b82f6;
  color: white;
  border-radius: 6px;
  cursor: pointer;
}
button:hover { background: #2563eb; }
button:disabled { opacity: .6; cursor: not-allowed; }
</style>
