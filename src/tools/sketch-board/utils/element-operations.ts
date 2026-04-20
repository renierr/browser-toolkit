import type { SketchElement } from '../types.ts';
import { moveElement } from './transforms.ts';

/**
 * Deletes elements by ID
 */
export function deleteElements(
  elements: SketchElement[],
  selectedIds: Set<string>
): SketchElement[] {
  return elements.filter((e) => !selectedIds.has(e.id));
}

/**
 * Duplicates selected elements with an offset and new IDs
 */
export function duplicateElements(
  elements: SketchElement[],
  selectedIds: Set<string>
): { elements: SketchElement[]; newIds: Set<string> } {
  if (selectedIds.size === 0) return { elements, newIds: new Set() };

  const idMap = new Map<string, string>();

  const cloneElement = (el: SketchElement): SketchElement => {
    const clone = JSON.parse(JSON.stringify(el)) as SketchElement;
    const oldId = clone.id;
    const newId = `${clone.type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    clone.id = newId;
    idMap.set(oldId, newId);

    if (clone.type === 'group') {
      clone.elements = clone.elements.map((sub) => cloneElement(sub));
    }
    return clone;
  };

  const newClones: SketchElement[] = [];
  for (const id of selectedIds) {
    const el = elements.find((e) => e.id === id);
    if (!el) continue;
    newClones.push(cloneElement(el));
  }

  // Fix snaps for elements that pointed to other duplicated elements
  const fixSnaps = (el: SketchElement) => {
    if ('startSnap' in el && el.startSnap && idMap.has(el.startSnap.elementId)) {
      el.startSnap.elementId = idMap.get(el.startSnap.elementId)!;
    }
    if ('endSnap' in el && el.endSnap && idMap.has(el.endSnap.elementId)) {
      el.endSnap.elementId = idMap.get(el.endSnap.elementId)!;
    }
    if (el.type === 'group') {
      el.elements.forEach(fixSnaps);
    }
  };
  newClones.forEach(fixSnaps);

  const offset = 20;
  const resultElements = [...elements];
  const newIds = new Set<string>();

  for (const clone of newClones) {
    moveElement(clone, offset, offset);
    resultElements.push(clone);
    newIds.add(clone.id);
  }

  return { elements: resultElements, newIds };
}

/**
 * Moves selected elements to the front (top) of the stack
 */
export function reorderToFront(
  elements: SketchElement[],
  selectedIds: Set<string>
): SketchElement[] {
  if (selectedIds.size === 0) return elements;
  const selected: SketchElement[] = [];
  const remaining: SketchElement[] = [];

  for (const el of elements) {
    if (selectedIds.has(el.id)) {
      selected.push(el);
    } else {
      remaining.push(el);
    }
  }
  return [...remaining, ...selected];
}

/**
 * Moves selected elements to the back (bottom) of the stack
 */
export function reorderToBelow(
  elements: SketchElement[],
  selectedIds: Set<string>
): SketchElement[] {
  if (selectedIds.size === 0) return elements;
  const selected: SketchElement[] = [];
  const remaining: SketchElement[] = [];

  for (const el of elements) {
    if (selectedIds.has(el.id)) {
      selected.push(el);
    } else {
      remaining.push(el);
    }
  }
  return [...selected, ...remaining];
}

/**
 * Groups selected elements into a single group element
 */
export function groupElements(
  elements: SketchElement[],
  selectedIds: Set<string>
): { elements: SketchElement[]; newGroup: SketchElement | null } {
  if (selectedIds.size < 2) return { elements, newGroup: null };

  const groupElements: SketchElement[] = [];
  const remainingElements: SketchElement[] = [];

  for (const el of elements) {
    if (selectedIds.has(el.id)) {
      groupElements.push(el);
    } else {
      remainingElements.push(el);
    }
  }

  const group: SketchElement = {
    id: `group-${Date.now()}`,
    type: 'group',
    elements: groupElements,
    color: groupElements[0].color,
    width: groupElements[0].width,
  };

  remainingElements.push(group);
  return { elements: remainingElements, newGroup: group };
}

/**
 * Ungroups a selected group element
 */
export function ungroupElements(
  elements: SketchElement[],
  selectedIds: Set<string>
): { elements: SketchElement[]; newSelectedIds: Set<string> } {
  if (selectedIds.size !== 1) return { elements, newSelectedIds: selectedIds };
  const id = selectedIds.values().next().value;
  const el = elements.find((e) => e.id === id);
  if (!el || el.type !== 'group') return { elements, newSelectedIds: selectedIds };

  const remainingElements = elements.filter((e) => e.id !== id);
  const newSelectedIds = new Set<string>();

  for (const subEl of el.elements) {
    remainingElements.push(subEl);
    newSelectedIds.add(subEl.id);
  }

  return { elements: remainingElements, newSelectedIds };
}
