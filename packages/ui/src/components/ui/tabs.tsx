"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "../../lib/cn.ts";

function Tabs(props: TabsPrimitive.Root.Props) {
	return <TabsPrimitive.Root {...props} />;
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
	return (
		<TabsPrimitive.List
			className={cn(
				"flex w-fit gap-1 rounded-full border border-border bg-[var(--paper)] p-1",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			className={cn(
				"rounded-full px-3 py-1 text-ui data-selected:bg-primary data-selected:text-primary-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel className={cn("mt-3 text-ui", className)} {...props} />
	);
}

export { Tabs, TabsList, TabsPanel, TabsTab };
