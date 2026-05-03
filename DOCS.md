# 東京メトロラン 仕様＆設計ドキュメント

オマタユースケが個人開発しているリアル移動型ビンゴゲーム。
プレイヤーは実際に東京メトロ／都営地下鉄に乗って駅を巡り、駅マスを埋める＆ミッションを達成して得点を競います。

---

## 1. このアプリは何をしている？

**ゲームの流れ**

1. 主催者がアプリでゲームを作成 → 6文字の招待コードが発行される
2. 参加者は招待コードと名前で参加 → 主催者がチームに振り分け
3. 主催者がゲーム開始 → 制限時間内（既定8時間）にプレイ
4. 各チームはトランプを引いた数だけ移動し、到着駅をアプリに記録
5. 駅マス（5×5ビンゴ）を埋める／ミッションを達成 → ポイント加算
6. 制限時間終了で自動集計、ランキング発表

**2つのモード**

- **ベーシック**：駅ビンゴだけ。マス1pt + ビンゴ1列3pt。
- **ダブルビンゴ**：駅ビンゴ＋ミッションビンゴを両方進行。
  得点は **駅ポイント × ミッションポイント**（掛け算で逆転要素）

---

## 2. 技術スタック

| 種類 | 採用技術 | 備考 |
|---|---|---|
| フロント | **React 18**（UMD CDN）+ **Babel Standalone** | ビルド工程なし。`<script type="text/babel">` で直接JSXを書く |
| バックエンド | なし（フロント直結） | サーバーレス |
| データベース | **Firebase Realtime Database**（asia-southeast1）| 全状態を `games_v6/{招待コード}` に保存 |
| 認証 | **Firebase Anonymous Auth** | プレイヤーごとに匿名ユーザを作成し、DB アクセス権を発行 |
| ホスティング | **Firebase Hosting** | カスタムドメイン未設定 |
| ローカル永続化 | localStorage | 同意状態・現セッション情報・写真退避領域 |
| デザイン | 純CSS（フレームワークなし）| 路線カラーをアクセントに採用 |

**この構成にした理由（CTO 視点）**

- ビルドツール（Webpack / Vite 等）を入れない代わりに、**1ファイル editできる→デプロイ`firebase deploy`** という最短サイクルを優先
- 同時接続数が少ない（1大会＝最大8人程度）ので Realtime Database で十分
- バックエンドコードが要らないので、運用負荷ゼロ

**この構成のトレードオフ**

- Babel Standalone は本番でJSXを毎回パースするので**初回ロードが少し遅い**（数百ms）
- 単一HTMLが2000行超でファイル肥大化（許容範囲）
- 写真や大きなデータは保存に向かない（dataURLが1MB超えるとRTDBに乗らない実害があり、今回写真機能を削除した経緯）

---

## 3. ファイル構成

```
tokyo-metro-run/
├── index.html          # アプリ本体（HTML+CSS+JSX 単一ファイル、約2100行）
├── terms.html          # 利用規約
├── privacy.html        # プライバシーポリシー
├── firebase.json       # Hosting / Database のデプロイ設定
├── database.rules.json # RTDB のセキュリティルール
└── assets/
    └── brand.md        # ブランドメモ
```

**index.html の内部構成**

```
<style>          … CSS（約200行、デザインシステム）
<script>
  // ── FIREBASE ──        Firebase 初期化、匿名認証、保存/読み込み/購読
  // ── CONSTANTS ──       マジックナンバー（BOARD_SIZE, デフォルト時間 など）
  // ── DATA ──            METRO_LINES, ALL_STATIONS, STATION_CODE_MAP, DEFAULT_MISSIONS
  // ── HELPERS ──         ビンゴカード生成、スコア計算、監査ログ追加 など
  // ── COMPONENTS ──      RuleScreen, BingoPage, ArrivalPage, MissionPage,
  //                       ScorePage, AdminPage, OrganizerSetup, StartScreen,
  //                       ConsentModal, PlayerJoin, AdminJoin, ShareModal, Toast, Icon
  // ── MAIN APP ──        App コンポーネント（状態管理＋画面切替＋全 handler）
</script>
```

---

## 4. データモデル（gameState）

Firebase の `games_v6/{コード}` に保存される単一オブジェクト。すべての画面はこれを購読してリアクティブに更新される。

```javascript
{
  gameCode: "ABC123",                  // 6文字の招待コード（パス兼用）
  version: "v7",                       // データスキーマ版
  title: "メトロラン第1回",
  state: "recruiting",                 // recruiting | team_building | in_progress | finished
  startAt: "2026-05-03T13:00",
  endAt: "2026-05-03T21:00",
  startedAt: 1714752000000,            // 実開始 timestamp
  finishedAt: "2026-05-03T21:00:42Z",
  startStationId: "otemachi",
  startStationName: "大手町",

  config: {
    mode: "double",                    // basic | double
    routeMode: "metro",                // metro | full（メトロのみ / +都営）
    gameDuration: 28800000,            // ms
    teamCount: 2,
    playerLimit: 8,
    goalEnabled: false,
    goalAmount: -5,
    version: "v7",
  },

  extras: {                            // 表示専用の付随情報
    goalStation, goalCondition, meetupPoint, meetupTime,
  },

  rules: { custom: "差分ルール文章" },

  missions: [ ... ],                   // 大会で使うミッション一覧（既定24件）

  participants: [
    {
      id: "p1714752000123abcd",
      name: "ユウスケ",
      status: "assigned",              // pending | joined | assigned
      teamId: "t1",
      active: true,
      joinedAt: "...",
      nameHistory: [{ name, changedAt }],
    },
  ],

  teams: [
    {
      id: "t1",
      name: "チームA",
      color: "#e60012",
      stationCard: [/* 25マス分の駅セル、または FREE */],
      missionCard: [/* ダブルモード時のみ、25マス分のミッション */],
      stationReached: ["FREE", "ginza", ...],  // 訪問した駅IDのリスト
      missionReached: ["FREE", "m07", ...],    // 達成したミッションIDのリスト
      missionStationClaims: { "ginza": "m07" },// 「どの駅で何を達成したか」（1駅1件制限の根拠）
      missionSubmissions: { "m07": "completed" },
      currentStation: "ginza",
      manualScoreDelta: 0,             // 運営が手動で増減した分
      goalPenalty: 0,                  // ゴール条件未達のペナルティ枠（未使用）
      memberIds: ["p..."],             // 表示用にhydrate時に再計算
      logs: [{ type, title, sub, time }, ...],
    },
  ],

  events: [
    {
      id: "e1",
      name: "ライブ会場キャパ対決",
      desc: "...",
      type: "manual",                  // manual | time
      scheduledTime: "13:00",          // type==='time' のときに自動発動する時刻
      reward: "任意1マス",
      status: "pending",               // pending | active | done
      triggeredAt: null,
    },
  ],

  auditLogs: [
    { id, type, time, message },       // 大会全体の監査ログ
  ],
}
```

**重要なフィールドの読み方**

- `state` は4状態のステートマシン。`recruiting → team_building → in_progress → finished`
- `participants` と `teams` は別配列。`participant.teamId` で関連付け、`hydrateTeamMembers()` で `team.memberIds` を再計算
- `stationReached` 先頭の `"FREE"` は中央マスを最初から開けておくため
- `missionStationClaims` は「同じ駅で複数ミッション達成」を防ぐ実装の要

---

## 5. 主要なロジック

### ビンゴカード生成（`genStationCard`, `genMissionCard`）

5×5＝25マス。**中央はFREE**、4隅は **固定候補（西葛西・平和台・月島・王子）から2駅 + 難易度3駅から2駅** をランダム配置。残り20マスは難易度別配分（diff1: 4 / diff2: 12 / diff3: 4）でランダム抽選。

実装：`buildStationPools` → `allocateDifficultySlots` → `placeStationsOnBoard`

### 駅コードの修復（`repairStationCard`）

過去に保存されたカードに「現在の除外駅リスト（大手町など）」が含まれていた場合に差し替えるための関数。表示前に毎回噛ませる。

### スコア計算（`calcScore`）

```
駅ポイント       = 訪問駅数 + 駅ビンゴ列数 × 3
ミッションポイント = 達成数 + ミッションビンゴ列数 × 3

ベーシック:    total = 駅ポイント + manualScoreDelta + goalPenalty
ダブルビンゴ:  total = 駅ポイント × ミッションポイント + manualScoreDelta + goalPenalty
```

### リアルタイム同期

- 主催者がゲーム作成 → `fbSave` で `games_v6/{コード}` に書き込み
- 全クライアントが `fbSub` で同じパスを購読
- 誰かが `save()` を呼ぶと、Firebase経由で全端末に変更がpushされ、Reactの`setState`が走る

→ ポーリング不要、ほぼ即時反映（モバイル回線でも数秒以内）

### タイマー

- `App` コンポーネントの `setInterval(1000ms)` で `nowTs` を更新
- 同じインターバル内で「`scheduledTime` 一致のイベントを active 化」「`endAt` 到達で大会自動終了」を判定

---

## 6. セキュリティ設計

**Firebase Realtime Database ルール**（`database.rules.json`）

```json
"games_v6": {
  "$code": {
    ".read":  "auth != null",
    ".write": "auth != null",
    ".validate": "$code.matches(/^[A-Z0-9]{6}$/)"
  }
}
```

- 匿名認証ユーザのみ読み書き可能
- 招待コード形式（英大文字＋数字6桁）を強制
- それ以外のパスは全拒否（`$other` で `false`）

**現状の脅威モデル**

- 匿名認証なので「コードを知っていれば誰でも参加可」 → カジュアルパーティゲーム前提のため許容
- 6桁コードの総当たりは理論上可能だが、`games_v6/{ランダム6桁}` を全探索しても他人の大会を**閲覧**できるだけ。**改ざんも可能**な点は注意が必要
- 本格運用するなら `auth.uid` ベースのアクセス制御 + 主催者署名が必要

---

## 7. デプロイ手順

```bash
# 初回のみ
npm install -g firebase-tools
firebase login

# プロジェクトのルートで
firebase use tokyo-metro-run

# デプロイ
firebase deploy
# → Hosting と Database ルールが両方デプロイされる
```

ビルド不要なので **`index.html` を編集 → `firebase deploy` だけ** で反映。

---

## 8. 既知の制約・将来課題

- **写真機能なし**：かつてはbase64でRTDBに保存していたが、サイズ制限で実質動かなかったので削除。証拠はLINEグループに残す運用
- **ミッションは即時反映**：運営承認なし。仲間内信頼ベース
- **データ保存期間**：明示的な削除処理なし。Firebase 側で手動メンテが必要
- **スマホ最適化のみ**：PCで開いても動くがレイアウトはモバイル前提
- **オフライン対応なし**：地下では Firebase 同期が止まる。地上に出ると自動再同期

---

## 9. コード共有方法（仲間に渡す）

### A. GitHub リポジトリ経由（推奨）

リポジトリ：`git@github.com:omt1990/tokyo-metro-run.git`

**仲間にコードだけ見てほしい場合**

```bash
git clone git@github.com:omt1990/tokyo-metro-run.git
open index.html
```

`index.html` をブラウザで開けば動きはする。ただし Firebase の設定はオマタのプロジェクト（`tokyo-metro-run`）に向いているので、**書き込みはオマタのDBに対して走る**。テスト目的ならOK、独立して運用したいならNG。

**仲間にコラボしてもらう場合**

1. GitHub の `omt1990/tokyo-metro-run` リポジトリで Settings → Collaborators → 招待
2. 招待を受けた人は clone → ブランチを切って編集 → PR を出す
3. オマタが PR をレビュー → main にマージ → `firebase deploy` で本番反映

→ コードレビュー前提のフローで安全。

### B. ZIPで丸ごと渡す（最速・最雑）

```bash
cd ~/ai-projects/projects/tokyo-metro-run
zip -r tokyo-metro-run.zip . -x ".git/*" "node_modules/*" ".claude/*"
```

→ できた `tokyo-metro-run.zip` をDM/メールで送る。
受け取り側は解凍して `index.html` をブラウザで開く。**Firebaseは共有のオマタ環境に書き込まれる**点だけ注意。

### C. 仲間が独立して運用したい場合

仲間が自分のFirebaseプロジェクトを作って運用するパターン：

1. 仲間が [Firebase Console](https://console.firebase.google.com/) で新プロジェクト作成
2. Realtime Database / Anonymous Authentication を有効化
3. プロジェクト設定 → 「アプリを追加」→ Web → 出てくる `firebaseConfig` をコピー
4. `index.html` の **L222–230** の `firebase.initializeApp({...})` を自分の設定で上書き
5. `database.rules.json` をコピーしてデプロイ
6. `firebase deploy --project 自分のプロジェクトID`

→ 完全に独立した東京メトロランが立ち上がる。

### D. デプロイ済みURLだけ渡す

仲間がコードをいじる必要がない＝ただプレイしたいだけなら、本番URL（Firebase Hostingで発行されたもの。`https://tokyo-metro-run.web.app/` など）を共有するだけでOK。コード共有は不要。

---

## 10. リファクタの履歴メモ

直近のセッションで実施：

- **写真添付機能の完全削除**（base64保存がRTDBサイズ制限で実質動かなかった）
- **未使用 `pendingApprovals` 配列と承認フローの削除**（ミッションは元から自動反映）
- **マジックナンバーの定数化**（`BOARD_SIZE`, `DEFAULT_GAME_DURATION_MS` 等）
- **監査ログ／チームログ追加の共通ヘルパー化**（`appendAuditLog` / `appendTeamLog`）
- **未使用フィールドの削除**（`extras.events`, `timedEvents`, `battleEvents`, `retentionDays`）
- **不要CSSクラスの削除**（`ms-pend`, `ms-rej`, `mission-item.pend`）

ファイルサイズ：2212行 → 2143行（-69行 / -3.1%）
