# 大鱼吃小鱼 (Big Fish Eat Small Fish)

一个用 Three.js 从零搭建的 3D 大鱼吃小鱼游戏。鱼身体是程序化建模 + 骨骼蒙皮，摆尾游动是行波式动画（振幅从头到尾递增、相位滞后），没有用任何外部模型文件。

## 玩法

- 鼠标移动控制转向，鱼会自然地摆尾游动、转弯压身倾斜
- 按住 `Shift` 或点击左键：持续加速
- 按 `空格` 或点击右键：瞬间冲刺扑向猎物（有冷却）
- 每条鱼头顶有颜色标记：绿色可吃，红色危险，黄色势均力敌
- 吃掉比自己小的鱼可以成长，遇到更大的鱼要及时躲避
- 长到体长 10m 即可获胜，成为海域之王

## 开发

```bash
npm install
npm run dev
```

打开终端提示的地址（默认 http://localhost:5173/）即可游玩。

```bash
npm run build    # 生产构建
npm run preview  # 预览生产构建
```

## 技术栈

- [Three.js](https://threejs.org/) + [Vite](https://vitejs.dev/)
- 纯前端，无后端/无服务器逻辑

## 项目结构

```
src/
  game/
    fish/            程序化鱼身几何体、鱼鳍、骨骼动画装配
    entities/        玩家/AI 鱼的转向、AI 行为逻辑
    effects/         冲刺气泡尾迹、体型对比标记
    World.js         海底地形、岩石、海草、气泡、光照
    Game.js          主循环、生成/吞食/成长、镜头跟随
    Input.js         输入控制
    UI.js            开始/结束界面、HUD
  main.js
```
