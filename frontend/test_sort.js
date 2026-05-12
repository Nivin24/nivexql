const cells = [
  { id: '1', isPinned: false },
  { id: '2', isPinned: false },
  { id: '3', isPinned: false }
];

const togglePinCell = (id) => {
  const newCells = cells.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c);
  newCells.sort((a, b) => {
    const aPinned = !!a.isPinned;
    const bPinned = !!b.isPinned;
    return aPinned === bPinned ? 0 : aPinned ? -1 : 1;
  });
  return newCells;
};

console.log(togglePinCell('2'));
