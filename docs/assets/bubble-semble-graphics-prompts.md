# Bubble Semble: 레트로 픽셀 그래픽 에셋 생성 프롬프트

## 1. 문서 목적

이 문서는 초등학생용 1~10인 온라인 협동 수학 액션 게임 **Bubble Semble**의 그래픽 에셋을 일관된 스타일로 제작하기 위한 프롬프트 모음입니다.

- 장르: 레트로 픽셀 아케이드 액션
- 플랫폼: 태블릿·PC 웹 브라우저
- 화면: 가로형 16:9
- 핵심 행동: 이동, 점프, 거품 발사, 몬스터 포획, 거품 터뜨리기, 친구 구출, 수학 문제 해결
- 저작권 원칙: 기존 상용 게임의 캐릭터·몬스터·맵·로고를 복제하지 않고 완전히 새로운 실루엣과 세계관으로 제작

---

## 2. 공통 제작 규격

| 에셋 | 기준 크기 | 제작 방식 |
|---|---:|---|
| 기본 타일 | 32×32 px | 정수 배율 확대 전제 |
| 플레이어 프레임 | 48×48 px | 하단 중앙 앵커 |
| 일반 몬스터 | 48×48 px | 하단 중앙 앵커 |
| 대형 몬스터 | 64×64 px | 하단 중앙 앵커 |
| 보스 | 128×96 px | 하단 중앙 앵커 |
| 아이템·수학 기호 | 24×24 또는 32×32 px | 투명 배경 |
| 터치 버튼 | 96×96 px 원본 | 화면에서 축소 사용 |
| UI 아이콘 | 32×32 또는 48×48 px | 굵은 외곽선 |
| 배경 | 1920×1080 px | 3단 패럴랙스 분리 |

### 색상과 표현 원칙

- 한 캐릭터당 핵심 색상 3~5개와 공통 외곽선 색상 사용
- 검정색 대신 짙은 남색 외곽선 사용
- 태블릿에서 알아보기 쉽도록 작은 장식보다 큰 실루엣 우선
- 10명이 동시에 등장해도 캐릭터를 구별할 수 있도록 머리·귀·꼬리·모자 형태를 다르게 구성
- 흐림, 반투명 붓 터치, 복잡한 질감, 안티앨리어싱 사용 금지
- 모든 스프라이트는 정수 배율로 확대해도 선명해야 함

---

## 3. 모든 생성 요청에 붙이는 스타일 잠금 문구

아래 블록을 각 프롬프트 마지막에 붙입니다.

```text
Shared production style:
- original retro pixel-art asset for a child-friendly 2D browser game
- crisp hand-placed pixel clusters, no anti-aliasing, no blur
- bold dark-navy outline, bright high-contrast arcade palette
- clear silhouette readable on a tablet at small scale
- friendly magical adventure tone, energetic but never frightening
- consistent 32-pixel tile grid and integer-scale rendering
- production game asset, not concept art, not a poster, not an illustration
- do not imitate or reproduce any existing commercial game character, logo, enemy, map, or composition
```

### 공통 제외 조건

```text
Avoid:
- existing copyrighted game characters or recognizable look-alikes
- gradients, painterly shading, vector-smooth edges, 3D rendering
- realistic humans, realistic weapons, blood, horror, violence
- text, letters, numbers, watermarks, signatures, logos
- scenery behind isolated sprites
- uneven frame sizes, changing proportions, changing costume details
- cropped limbs, duplicate body parts, extra characters
```

---

## 4. 권장 제작 순서

1. 대표 플레이어 캐릭터의 정면 콘셉트 제작
2. 대표 캐릭터의 오른쪽 방향 기본 자세 1프레임 확정
3. 승인된 기본 프레임을 기준으로 애니메이션 스트립 생성
4. 같은 스타일로 나머지 플레이어 캐릭터 확장
5. 일반 몬스터와 보스 생성
6. 맵 타일과 패럴랙스 배경 생성
7. 거품·정답·팀 기술 이펙트 생성
8. HUD·터치 버튼·아이콘 생성
9. 실제 게임 배율로 미리보기 후 색상과 앵커 보정

> 중요: 애니메이션은 프레임을 하나씩 따로 만들지 말고, 승인된 기준 프레임을 포함한 전체 스트립을 한 번에 생성합니다.

---

## 5. 플레이어 캐릭터 구성

| 번호 | 캐릭터 | 실루엣 특징 | 대표색 | 속성 |
|---:|---|---|---|---|
| 1 | 루미 | 큰 별 모자와 짧은 망토 | 노랑 | 빛 |
| 2 | 포포 | 긴 물방울 귀와 둥근 가방 | 하늘 | 물 |
| 3 | 토리 | 잎사귀 후드와 큰 꼬리 | 초록 | 숲 |
| 4 | 라라 | 번개 귀와 지그재그 스카프 | 주황 | 번개 |
| 5 | 미루 | 초승달 모자와 고양이 꼬리 | 보라 | 달 |
| 6 | 보보 | 잠수경과 물갈퀴 장갑 | 청록 | 바다 |
| 7 | 코코 | 불꽃 볏과 짧은 날개 | 빨강 | 불꽃 |
| 8 | 두리 | 구름 머리와 둥근 장화 | 흰색·파랑 | 구름 |
| 9 | 네모 | 블록 몸체와 수정 심장 | 남색 | 바위 |
| 10 | 리오 | 고리형 헬멧과 별 꼬리 | 분홍 | 우주 |

### 5-1. 대표 캐릭터 루미 콘셉트

```text
Intended use: approved visual seed for the main playable character in a cooperative educational arcade game.

Create one original full-body retro pixel-art character named Lumi, a tiny magical bubble explorer.
Lumi has a large five-point star-shaped hat, a short teal cape, round amber goggles resting above the eyes, small boots, and a compact child-friendly fantasy silhouette.
The character should feel clever, brave, cheerful, and non-gendered.
Use a restrained palette of golden yellow, teal, cream, coral accents, and a dark-navy outline.

Presentation:
- one neutral three-quarter reference pose and one clean right-facing in-game idle pose
- place the two views side by side with generous empty space
- transparent background
- no props except a small bubble wand attached to the belt
- readable face and silhouette at 48×48 pixels

Use the shared production style and avoidance rules from this document.
```

### 5-2. 나머지 9명 캐릭터 시드 제작 템플릿

`<CHARACTER_DESCRIPTION>`에 위 표의 실루엣·색상·속성을 넣어 각각 생성합니다.

```text
Intended use: approved visual seed for one playable character in the same game as the provided Lumi reference.

Create one original full-body retro pixel-art bubble explorer based on this description:
<CHARACTER_DESCRIPTION>

Preserve the same production universe as the Lumi reference:
- equal apparent height and visual weight
- the same outline thickness and pixel density
- the same friendly face readability
- a clearly different silhouette and dominant color for multiplayer identification
- one neutral three-quarter reference pose and one clean right-facing in-game idle pose
- transparent background
- readable at 48×48 pixels

Do not copy Lumi's hat, cape, or body silhouette. Do not reproduce any existing commercial game character.
Use the shared production style and avoidance rules from this document.
```

---

## 6. 플레이어 애니메이션 스트립

각 캐릭터의 승인된 오른쪽 방향 기본 프레임을 참조 이미지로 사용합니다. 왼쪽 방향은 게임 엔진에서 수평 반전합니다.

### 6-1. 대기 애니메이션 — 4프레임

```text
Intended use: production spritesheet for a playable character's idle animation.
Edit the provided transparent reference canvas into one horizontal 4-frame spritesheet.

The leftmost slot contains the approved anchor frame and must remain the exact same character:
- same right-facing direction
- same silhouette, palette, face, costume, and proportions

Animation beats:
1. exact approved neutral idle pose
2. gentle breathing upward, eyes open
3. tiny blink with cape or accessory settling
4. return smoothly toward the neutral pose

Composition:
- exactly one row with 4 equal 48×48 frame slots
- transparent canvas
- bottom-center anchor identical in every frame
- no scenery, labels, effects, or additional characters

Use the shared production style and avoidance rules from this document.
```

### 6-2. 달리기 — 6프레임

```text
Create one horizontal 6-frame production spritesheet from the approved character seed.
The character faces right in every frame and keeps the exact same identity, palette, silhouette, outfit, and proportions.

Animation beats:
1. contact pose, front foot forward
2. body compresses slightly
3. passing pose
4. opposite contact pose
5. light airborne step
6. return toward frame 1 for a seamless energetic loop

Exactly 6 equal 48×48 slots, transparent background, shared bottom-center anchor, crisp pixel clusters, no motion blur, no scenery, no text.
Use the shared production style and avoidance rules from this document.
```

### 6-3. 점프·낙하 — 4프레임

```text
Create one horizontal 4-frame production spritesheet from the approved character seed.

Animation beats:
1. crouched takeoff anticipation
2. rising pose with feet tucked
3. apex pose with a readable cheerful face
4. falling pose with feet prepared for landing

The character faces right. Preserve the exact same silhouette, palette, costume, and proportions.
Exactly 4 equal 48×48 slots, transparent background, shared bottom-center anchor, no effects, no scenery, no text.
Use the shared production style and avoidance rules from this document.
```

### 6-4. 거품 발사 — 6프레임

```text
Create one horizontal 6-frame production spritesheet for a right-facing bubble-casting action.

Animation beats:
1. approved neutral combat pose
2. bubble wand or hands draw back
3. cheeks and body compress with magical energy
4. clear forward casting pose
5. tiny circular bubble appears just beyond the hands
6. recoil and recovery toward the neutral pose

Keep the same character identity, silhouette, palette, face, outfit, and proportions.
Exactly 6 equal 48×48 slots, transparent background, shared bottom-center anchor.
Only the small casting bubble may appear; no scenery, labels, or extra characters.
Use the shared production style and avoidance rules from this document.
```

### 6-5. 거품 터뜨리기 — 4프레임

```text
Create one horizontal 4-frame production spritesheet for a short bubble-pop dash.

Animation beats:
1. ready pose leaning forward
2. fast forward step with one arm extended
3. strongest pop impact pose with a small star-shaped spark
4. balanced recovery pose

The character faces right and retains the exact same identity and proportions.
Exactly 4 equal 48×48 slots, transparent background, shared bottom-center anchor, no scenery or text.
Use the shared production style and avoidance rules from this document.
```

### 6-6. 피격·구출·승리

```text
Create one horizontal 12-frame production spritesheet divided into three clearly separated animation groups for the same approved character:

Frames 1-3: harmless surprised hit reaction, no injury
Frames 4-7: trapped inside a translucent magical bubble, then safely released
Frames 8-12: joyful team victory pose with one small celebratory sparkle

Keep the same right-facing direction, palette, silhouette, face, costume, and proportions.
Exactly 12 equal 48×48 slots, transparent background, shared bottom-center anchor.
No scenery, labels, text, or additional characters.
Use the shared production style and avoidance rules from this document.
```

---

## 7. 일반 몬스터

첫 번째 세트에는 아래 6종을 제작합니다.

| 몬스터 | 수학 모티브 | 행동 |
|---|---|---|
| 넘버 슬라임 | 숫자 조각 | 느리게 추적 |
| 연산 도깨비 | + − × ÷ | 짧은 원거리 공격 |
| 분수 나방 | 분수 조각 | 공중 이동 |
| 시계 톱니벌레 | 시각·시간 | 주기적 돌진 |
| 도형 게 | 삼각형·사각형 | 방패 방어 |
| 그래프 유령 | 막대그래프 | 순간 이동 |

### 7-1. 일반 몬스터 6종 시드 시트

```text
Intended use: visual seed sheet for six original enemies in a child-friendly cooperative math arcade game.

Create six distinct retro pixel-art monsters in one clean lineup:
1. Number Slime: a round jelly creature with harmless floating number-shaped markings
2. Operator Imp: a tiny playful creature carrying four abstract operator charms
3. Fraction Moth: a friendly flying moth with wings divided into simple fractional color regions
4. Clockwork Crawler: a low mechanical bug with a clock-hand tail
5. Geometry Crab: a squat crab with triangular claws and a square shell
6. Graph Ghost: a soft floating ghost whose body edge resembles a rising bar chart

Requirements:
- each monster uses a distinct dominant color and silhouette
- playful and mischievous, never frightening
- equal apparent scale for 48×48 gameplay frames
- one right-facing neutral pose per monster
- transparent background
- no text, labels, scenery, weapons, or existing game references

Use the shared production style and avoidance rules from this document.
```

### 7-2. 일반 몬스터 애니메이션 템플릿

```text
Intended use: production spritesheet for the provided approved enemy seed.
Create one horizontal 12-frame strip while preserving the exact same enemy identity, facing direction, silhouette, palette, and proportions.

Frames 1-4: looping idle or movement animation
Frames 5-8: unique attack or movement ability
Frames 9-11: safely trapped inside a magical bubble, visibly surprised but unharmed
Frame 12: small nonviolent sparkle-pop defeat pose

Exactly 12 equal 48×48 slots, transparent background, shared bottom-center anchor.
No scenery, text, labels, additional monsters, or poster composition.
Use the shared production style and avoidance rules from this document.
```

---

## 8. 첫 번째 보스: 혼돈의 큐브왕

### 8-1. 보스 시드

```text
Intended use: approved visual seed for the first cooperative boss in a retro pixel-art educational arcade game.

Create one original boss named the Chaos Cube King.
It is a large floating magical cube creature assembled from mismatched number blocks, fraction tiles, clock gears, and simple geometric plates.
The face is expressive and theatrical rather than frightening, with bright cyan eyes and a crooked golden crown made of rulers.
Its silhouette must be wide, readable, and visually distinct from all normal monsters.
Palette: deep indigo, magenta, cyan, gold, and dark-navy outline.

Presentation:
- one front three-quarter reference pose
- one clean right-facing gameplay pose sized for a 128×96 frame
- transparent background
- no scenery, text, labels, health bar, or player characters
- original design with no resemblance to an existing commercial boss

Use the shared production style and avoidance rules from this document.
```

### 8-2. 보스 애니메이션 스트립

```text
Create one horizontal 18-frame production spritesheet for the approved Chaos Cube King boss.
Preserve the exact same identity, silhouette, palette, crown, face, body parts, and proportions.

Frames 1-4: hovering idle loop with gears turning slightly
Frames 5-8: throws three harmless number-block projectiles
Frames 9-12: activates a geometric shield made of four glowing plates
Frames 13-15: stunned after the team solves a math challenge, crown tilted
Frames 16-18: cheerful nonviolent defeat transformation into small sparkling cube pieces

Exactly 18 equal 128×96 slots in one horizontal row.
Transparent background, shared bottom-center anchor, no scenery, labels, text, UI, or players.
Use the shared production style and avoidance rules from this document.
```

---

## 9. 첫 번째 월드: 별빛 수학 유적

### 9-1. 32px 타일셋

```text
Intended use: production-ready 32×32 modular tileset for a retro pixel-art 2D platform game.

Create an original magical night-ruins tileset called Starlight Math Ruins.
Theme elements: deep indigo stone, cyan glowing runes, golden star moss, simple geometric carvings, bubble portals, and child-friendly fantasy machinery.

Include on one transparent tile atlas:
- seamless ground center, left edge, right edge, inner and outer corners
- one-way floating platforms in short, medium, and long variants
- wall, ceiling, and pillar segments
- gentle slope tiles
- breakable block and activated block states
- closed and open team gate
- inactive and active bubble portal
- checkpoint pedestal
- safe spawn platform
- decorative number stones without readable written numerals
- small plants, crystals, lanterns, and gear decorations

Technical requirements:
- strict 32×32 tile grid
- all platform seams connect perfectly
- no perspective distortion
- no baked lighting beyond local pixel highlights
- transparent background
- no characters, UI, text, labels, or full scene composition

Use the shared production style and avoidance rules from this document.
```

### 9-2. 패럴랙스 배경 3개 레이어

각 레이어를 별도 이미지로 생성합니다.

#### 먼 배경

```text
Create a seamless horizontal far-background layer for Starlight Math Ruins, 1920×1080.
Show a calm indigo night sky, distant rounded mountains, tiny stars, and faint geometric constellations.
Low contrast, sparse detail, no foreground objects, no characters, no text.
Retro pixel-art production background with crisp clusters and no anti-aliasing.
```

#### 중간 배경

```text
Create a seamless horizontal middle-background layer for Starlight Math Ruins, 1920×1080, with transparency where appropriate.
Show distant ruined arches, floating islands, slow bubble streams, and large inactive gears.
Medium-low contrast so gameplay sprites remain dominant.
No characters, enemies, UI, labels, or readable numbers.
Retro pixel-art production background with crisp clusters and no anti-aliasing.
```

#### 앞쪽 장식 레이어

```text
Create a seamless horizontal foreground-decoration layer for Starlight Math Ruins, 1920×1080, mostly transparent.
Include occasional dark vines, crystal edges, arch fragments, and soft cyan rune glows around the outer frame only.
Keep the central gameplay area visually clear.
No characters, enemies, text, or UI.
Retro pixel-art production background with crisp clusters and no anti-aliasing.
```

---

## 10. 거품과 전투 효과

### 10-1. 기본 효과 아틀라스

```text
Intended use: production VFX sprite atlas for a child-friendly retro pixel-art bubble action game.

Create a transparent atlas containing clearly separated animation strips:
- basic bubble forming and floating: 6 frames
- bubble impact and soft pop: 6 frames
- monster trapped inside a bubble shell: 4 empty shell frames
- correct-answer sparkle burst: 6 frames, cyan and gold
- incorrect-answer gentle wobble: 4 frames, coral and violet, never punitive
- teammate rescue ring: 6 frames, mint and white
- team super move spiral: 8 frames, rainbow palette with controlled brightness
- boss shield break: 8 frames, geometric cyan shards that dissolve safely

Use equal-sized slots within each labeled grouping area, but do not render actual text labels into the image.
Transparent background, crisp pixel clusters, no blur, smoke, realistic fire, violence, scenery, or characters.
Use the shared production style and avoidance rules from this document.
```

### 10-2. 수학 정답 조각과 아이템

```text
Create one transparent 32×32 retro pixel-art item atlas for a cooperative math adventure game.

Include isolated icons for:
- glowing answer shard in ten player colors
- fraction tile pieces: half, third, and quarter represented visually without text
- clock-hand token
- ruler token
- triangle, square, circle, pentagon, and cube tokens
- plus, minus, multiply, and divide operator charms
- heart, shield, speed boost, hint star, team-energy crystal, checkpoint flag
- bronze, silver, gold, and rainbow growth badges

Every icon must have a unique silhouette, bold dark-navy outline, and transparent padding.
No scenery, text labels, numbers, watermarks, or existing game references.
Use the shared production style and avoidance rules from this document.
```

---

## 11. 태블릿 터치 조작 UI

### 11-1. 조작 버튼 세트

```text
Intended use: transparent touch-control icon set for a landscape tablet game.

Create an original retro pixel-art UI atlas with large high-contrast controls:
- left arrow
- right arrow
- jump button using an upward spring symbol
- bubble-shot button using one clear bubble symbol
- pop-dash button using a starburst symbol
- interact or answer-select button using a glowing hand symbol
- team-super button using three linked stars
- pause, sound, full-screen, and help icons

Style:
- 96×96 source size per circular button
- thick dark-navy border
- clearly different shapes and colors for movement versus action buttons
- readable under a translucent overlay
- pressed and unpressed state for every gameplay button
- transparent background
- no words, letters, numbers, gradients, or existing game UI references

Use the shared production style and avoidance rules from this document.
```

### 11-2. HUD 프레임과 퀴즈 카드

```text
Create a modular retro pixel-art HUD skin for a child-friendly 10-player cooperative math game.

Include isolated nine-slice-ready UI pieces for:
- player health and status panel
- team energy meter
- 10-player roster strip with connection state
- stage timer panel
- boss health panel
- math question card in small, medium, and boss-wide sizes
- multiple-choice answer button in normal, selected, correct, and retry states
- hint panel
- stage-clear and growth-result panel

Visual direction:
- deep navy panels, cyan edges, gold highlights, coral warning accents
- chunky arcade corners and geometric rune motifs
- large empty centers for live DOM text; do not bake in any text or numbers
- strong contrast and generous spacing for tablets
- transparent background around each isolated component

Use the shared production style and avoidance rules from this document.
```

---

## 12. 로비·성장 기록·보스 타임어택 화면

이 프롬프트는 최종 UI 이미지가 아니라 레이아웃 참고용 목업을 만들 때 사용합니다. 실제 버튼과 글자는 웹 UI로 구현합니다.

```text
Intended use: visual layout reference for a responsive landscape-tablet game interface, not a final baked screenshot.

Design one coherent retro pixel-art interface board showing three separate screens:
1. Class room lobby with a six-slot visible player grid and pagination or compact expansion up to ten players
2. Personal growth map showing math domains as glowing constellation nodes without public ranking
3. Cooperative boss time-attack results showing team members, actual clear time, adjusted time, accuracy, and teamwork badges

Use deep navy backgrounds, cyan panels, gold highlights, coral accents, chunky pixel borders, and the established Starlight Math Ruins motifs.
Reserve clean empty areas for Korean text rendered later by HTML.
Do not generate readable text, student names, personal data, logos, or existing game interface elements.
The layouts must remain legible on a 10-inch landscape tablet.
```

---

## 13. 시작 화면과 로고

### 13-1. 로고 심볼

```text
Create one original transparent retro pixel-art emblem for a game called Bubble Semble.
Combine a large iridescent bubble, three linked stars, a tiny geometric rune, and a soft upward motion.
The emblem must be friendly, adventurous, and readable as a small app icon.
Do not include any text or letters. Do not resemble an existing commercial game logo.
Use a deep-navy outline with cyan, gold, mint, and coral highlights.
Transparent background, crisp pixel clusters, no gradients, no blur, no mockup frame.
```

### 13-2. 시작 화면 배경

```text
Create an original 1920×1080 retro pixel-art title-screen background for Bubble Semble.
Show ten small, clearly distinct magical explorers standing on layered ruins while bright bubbles rise toward a starry portal.
Hint at math through geometric constellations, ruler-shaped ruins, fraction-tile mosaics, and clockwork ornaments without showing readable equations.
Leave a large quiet area in the upper center for a separate Korean logo and a clear area near the bottom for menu buttons.
Bright, adventurous, child-friendly, high contrast, no fear or violence.
No baked text, logos, watermarks, or recognizable elements from existing commercial games.
Use the shared production style from this document.
```

---

## 14. 품질 검수 체크리스트

### 캐릭터

- [ ] 모든 프레임에서 얼굴·의상·색상이 동일함
- [ ] 프레임마다 키나 머리 크기가 흔들리지 않음
- [ ] 오른쪽 방향과 하단 중앙 앵커가 유지됨
- [ ] 48×48 실제 크기에서 행동이 구분됨
- [ ] 10명의 실루엣과 대표색이 서로 겹치지 않음

### 몬스터·보스

- [ ] 어린이에게 무섭거나 폭력적으로 보이지 않음
- [ ] 거품에 갇힌 상태가 명확하게 보임
- [ ] 보스 패턴별 자세가 한눈에 구분됨
- [ ] 기존 상용 게임 캐릭터와 닮지 않음

### 맵

- [ ] 32×32 타일 경계가 끊기지 않음
- [ ] 충돌 발판과 장식 배경이 명확히 구분됨
- [ ] 문제 카드가 표시될 중앙 영역이 복잡하지 않음
- [ ] 10인 플레이에서도 캐릭터가 배경에 묻히지 않음

### UI

- [ ] 모든 터치 버튼의 최소 터치 영역이 충분함
- [ ] 이동 버튼과 행동 버튼의 색상·형태가 구분됨
- [ ] 이미지에 글자를 굽지 않고 실제 HTML 텍스트를 사용함
- [ ] 색상만으로 정답·오답·연결 상태를 구분하지 않음

---

## 15. 게임 적용 전 정규화 절차

1. 승인된 시드 프레임 주위에 투명 여백이 있는 편집 캔버스를 만듭니다.
2. 같은 캐릭터의 전체 애니메이션 스트립을 한 번에 생성합니다.
3. 스트립을 동일한 프레임 크기로 분할합니다.
4. 모든 프레임에 하나의 공통 배율을 적용합니다.
5. 하단 중앙 앵커를 기준으로 정렬합니다.
6. 첫 프레임이 기준 시드와 달라졌다면 승인된 시드로 다시 고정합니다.
7. 미리보기 시트를 만들어 실제 게임 크기에서 확인합니다.
8. 검수가 끝난 에셋만 게임의 에셋 목록에 등록합니다.

### 권장 파일명 예시

```text
assets/
  characters/
    lumi/
      lumi-idle-48x48.png
      lumi-run-48x48.png
      lumi-jump-48x48.png
      lumi-bubble-shot-48x48.png
  enemies/
    number-slime/
  bosses/
    chaos-cube-king/
  worlds/
    starlight-ruins/
  effects/
  items/
  ui/
```

---

## 16. 첫 제작 권장 범위

처음부터 모든 그래픽을 생성하지 않고 아래 순서로 검증합니다.

1. 루미 시드 프레임 1개
2. 루미 대기·달리기·점프·거품 발사 스트립
3. 넘버 슬라임 1종과 포획 애니메이션
4. 32px 발판 타일 1세트
5. 기본 거품·정답 효과
6. 태블릿 조작 버튼
7. 실제 Phaser 테스트 화면에서 크기·색상·조작성 검증

이 범위가 통과한 뒤 나머지 9명, 몬스터, 보스, 전체 UI로 확장하면 스타일 불일치와 재작업을 줄일 수 있습니다.
