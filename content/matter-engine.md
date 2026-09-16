A prototype C and C++ engine for procedural generation and ray-traced rendering of voxel and particle "matter". The long-term target is real-time rendering of billions of meshed static particles with level of detail, plus a dynamic particle-physics layer for thermal, electrical, chemical and bonding interactions.

It is a monorepo of independently buildable sub-projects: memory managers, spatial queries and BVH structures, a canonical math library, particle flow simulation, the marching-cubes cluster and cell meshing that feeds the ray tracer, UV charting, a content-addressed asset store, an always-on profiler, the MatterEngine3 kernel with its QuickJS script host and Vulkan renderer, and the MatterEditor.

The stone, water and light in this villa are baked by it.

[Source on GitHub](https://github.com/ElectricJack/matter-engine)
