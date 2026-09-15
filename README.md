# 공항 몇 시간 전 도착해야 할까? — v00.00.07

## 이번 버전 핵심
- 여행 유형 선택 제거: **출국 전용**으로 고정
- 주의사항에 **입국·환승 미지원** 명시
- 인천공항 공식 API 연동 코드는 포함되어 있지만, **Worker URL과 API 키를 실제 설정하기 전에는 공식 데이터를 사용하지 않습니다.**
- API 미연결 상태에서는 화면과 결과에 **자체 추정값**이라고 명확히 표시합니다.
- Worker가 실제 연결되고 공식 API가 정상 응답한 경우에만 결과에 **공식 API**라고 표시합니다.
- API 조회 실패 / D+2 이상 / 인천공항 외 공항:
  - 시간대·요일 추정 로직으로 자동 fallback
- 스마트패스 / 자동출입국심사 차이 설명 유지
- T1 본관 / T1 탑승동 / T2 이동시간 차이 반영
- 결과 공유 기능 유지


## 현재 배포 상태에서 반드시 확인할 점
`index.html`의 기본값은 아래와 같이 placeholder입니다.

```js
const API_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev";
```

이 값을 실제 Cloudflare Worker 주소로 바꾸기 전에는:
- 공식 API를 호출하지 않습니다.
- 화면에는 **현재 공식 API가 연결되지 않았습니다**라고 표시됩니다.
- 결과에는 **자체 추정값**이라고 표시됩니다.

실제 Worker 주소를 설정하고 공식 API가 정상 응답한 경우에만 결과에 **공식 API**라고 표시됩니다.

## 중요한 정확도 원칙
공식 API가 제공하는 값은 **시간대별 예상 승객 수**입니다.
이 값은 곧바로 "보안검색 30분"을 의미하지 않습니다.

따라서 계산기는:
`공식 예상 승객 수 → 혼잡 단계 → 추가 시간 버퍼`
방식으로 사용합니다.

현재 내부 버퍼 정책:
- 5,500명 미만: 원활
- 5,500~5,999명: 약간 혼잡
- 6,000~6,499명: 다소 혼잡
- 6,500~6,999명: 혼잡
- 7,000명 이상: 매우 혼잡

위 단계 기준은 인천공항 홈페이지에 공개된 BLUE/YELLOW/ORANGE/RED 시간당 승객 기준을 참고하되,
**보안검색 예상 소요분(mins)은 이 계산기의 자체 정책**입니다.

## 1. 공공데이터포털 활용신청
아래 API 활용신청이 필요합니다.

- 데이터: `인천국제공항공사_승객예고-출·입국장별`
- 데이터셋 ID: `15095066`
- 공식 요청 URL:
  `https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt`

공공데이터포털에서 발급받은 서비스키를 준비하세요.

## 2. Cloudflare Worker 배포
API 키를 GitHub Pages JavaScript에 직접 넣으면 공개되므로 Worker에 보관합니다.

```bash
npm install -g wrangler
wrangler login
cd <이 폴더>
wrangler secret put DATA_GO_KR_SERVICE_KEY
# 서비스키 입력
wrangler deploy
```

배포 후 Worker URL을 확인합니다.

예:
`https://airport-arrival-api.<your-subdomain>.workers.dev`

## 3. 프론트엔드 연결
`index.html`에서 아래 값을 Worker URL로 바꿉니다.

```js
const API_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev";
```

## 4. Origin 제한 권장
`wrangler.toml`의 `ALLOWED_ORIGIN`을 실제 GitHub Pages Origin으로 변경하세요.

예:
```toml
ALLOWED_ORIGIN = "https://capstonedrone.github.io"
```

그 뒤 다시:
```bash
wrangler deploy
```

## 5. GitHub Pages
`index.html`을 새 저장소 또는 원하는 Pages 경로에 올리면 됩니다.

## 데이터 적용 범위
공공데이터포털 API 설명상 이 API는 **조회일(D+0)과 조회일+1(D+1)** 데이터를 제공합니다.
따라서 계산기는:
- 오늘·내일 + 인천공항 → 공식 API 우선
- 그 외 → 자체 추정 fallback

## 사용자 안내문구
화면 하단에 다음 취지를 명시했습니다.
- 공식 예상 승객 수는 실제 보안검색 대기시간이 아님
- 항공편/탑승구/출국장 운영/보안검색 상황에 따라 실제와 다를 수 있음
- 항공사 공식 마감시간이 우선

공공데이터포털은 예상 혼잡도 성격의 대민 서비스 개발 시 사용자 안내문구를 관리부서와 협의하라고 명시하고 있으므로,
실제 공개 전에는 인천국제공항공사 관리부서와 문구를 확인하는 것이 안전합니다.

## 현재 버전에 넣지 않은 것
`인천국제공항공사_출국장 혼잡도 조회`(데이터셋 15148225)는 T1의 현재 대기인원을 1분 주기로 제공하지만,
이번 패키지에는 **실시간 API를 아직 연결하지 않았습니다.**

이유:
- 미래 출국시간 계산의 핵심은 승객예고 API
- 실시간 API는 현재 시점에 가까운 출국에서만 의미가 큼
- 실제 서비스키 승인 후 응답 구조를 live-call로 확인한 뒤 넣는 것이 안전함

즉 v00.00.07는 **공식 미래/당일 예고 API를 실제 연동한 첫 버전**입니다.


## 티스토리 자동 높이 조절(iframe + postMessage)
이번 버전부터 `index.html`이 자신의 높이를 부모 페이지에 `postMessage`로 전송합니다.

전송 메시지 형식:
```js
{
  source: "airport-arrival-calculator",
  type: "resize",
  height: <number>
}
```

티스토리 HTML 모드에는 아래 코드를 넣으면 됩니다.

```html
<div style="width:100%; margin:20px 0;">
  <iframe
    id="airportArrivalCalculatorFrame"
    src="https://capstonedrone.github.io/airport-arrival-calculator/"
    title="공항 도착시간 계산기"
    style="width:100%; min-height:900px; border:0; display:block;"
    loading="lazy">
  </iframe>
</div>

<script>
(function () {
  const iframe = document.getElementById('airportArrivalCalculatorFrame');
  if (!iframe) return;

  window.addEventListener('message', function (event) {
    if (event.origin !== 'https://capstonedrone.github.io') return;
    const data = event.data;
    if (!data || data.source !== 'airport-arrival-calculator' || data.type !== 'resize') return;
    if (typeof data.height !== 'number') return;

    iframe.style.height = Math.max(900, data.height) + 'px';
  });
})();
</script>
```

- `event.origin`은 GitHub Pages 도메인에 맞게 유지하세요.
- `src`가 바뀌면 해당 도메인에 맞춰 `event.origin`도 함께 바꿔야 합니다.
- 초기 로딩 중에는 `min-height:900px`가 기본 높이 역할을 합니다.
