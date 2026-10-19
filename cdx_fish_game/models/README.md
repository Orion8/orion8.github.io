# 실제 물고기 모델

`placeholder-fish.glb`는 직접 제작한 주황색 임시 물고기입니다. 본 4개와 반복 유영 클립을 포함하며 `npm run export:placeholder`로 다시 생성할 수 있습니다.

실제 채널 모델은 본 리깅과 애니메이션이 포함된 FBX를 Blender 등에서 GLB로 내보낸 뒤 이 폴더에 넣습니다. 실제 모델은 아직 제공되지 않았습니다.

로컬 파일은 개발 화면의 **GLB 모델 열기**로 즉시 확인할 수 있습니다. 자동 로딩하려면 `fish.glb`를 추가하고 `.env.example`을 `.env.local`로 복사한 다음 아래 값을 설정합니다.

```text
VITE_FISH_MODEL_URL=models/fish.glb
```

Vite 개발 서버를 다시 시작하면 적용됩니다. 이 경로는 Vite의 public 루트를 기준으로 하므로 URL에 `public/`을 넣지 않습니다.

텍스처를 포함한 단일 GLB를 권장합니다. 파일 선택 방식은 외부 텍스처 파일들을 함께 읽지 않습니다. FBX 확장자를 GLB로 바꾸기만 해서는 사용할 수 없습니다.
