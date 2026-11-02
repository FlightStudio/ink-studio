export function glyphBuildGate() {
	const pointers = new Set<number>();
	let building = false;

	return {
		pointerDown(id: number): boolean {
			if (building) return false;
			pointers.add(id);
			return true;
		},
		pointerEnd(id: number) {
			pointers.delete(id);
		},
		begin(): boolean {
			if (building || pointers.size > 0) return false;
			building = true;
			return true;
		},
		finish() {
			building = false;
		},
		editable: () => !building,
	};
}
