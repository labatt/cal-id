import { cubicBezier, useAnimate } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { useEffect } from "react";

import { BookerLayouts } from "@calcom/prisma/zod-utils";

import type { BookerLayout, BookerState } from "./types";

// Framer motion fade in animation configs.
export const fadeInLeft = {
  variants: {
    visible: { opacity: 1, x: 0 },
    hidden: { opacity: 0, x: 20 },
  },
  initial: "hidden",
  exit: "hidden",
  animate: "visible",
  transition: { ease: "easeInOut", delay: 0.1 },
};
export const fadeInUp = {
  variants: {
    visible: { opacity: 1, y: 0 },
    hidden: { opacity: 0, y: 20 },
  },
  initial: "hidden",
  exit: "hidden",
  animate: "visible",
  transition: { ease: "easeInOut", delay: 0.1 },
};

export const fadeInRight = {
  variants: {
    visible: { opacity: 1, x: 0 },
    hidden: { opacity: 0, x: -20 },
  },
  initial: "hidden",
  exit: "hidden",
  animate: "visible",
  transition: { ease: "easeInOut", delay: 0.1 },
};

type ResizeAnimationConfig = {
  [key in BookerLayout]: {
    [key in BookerState | "default"]?: React.CSSProperties;
  };
};

/**
 * This configuration is used to animate the grid container for the booker.
 * The object is structured as following:
 *
 * The root property of the object: is the name of the layout
 * (mobile, month_view, week_view, column_view)
 *
 * The values of these properties are objects that define the animation for each state of the booker.
 * The animation have the same properties as you could pass to the animate prop of framer-motion:
 * @see: https://www.framer.com/motion/animation/
 */
export const resizeAnimationConfig: ResizeAnimationConfig = {
  mobile: {
    default: {
      width: "100%",
      minHeight: "0px",
      gridTemplateAreas: `
          "meta"
          "header"
          "main"
          "timeslots"
        `,
      gridTemplateColumns: "100%",
      gridTemplateRows: "minmax(min-content,max-content) 1fr",
    },
  },
  // BROADSHEET: month_view is a full-bleed sheet, not a meta sidebar + calendar.
  // `meta` is promoted to a full-width head band (standing head + lead) stacked
  // ABOVE the calendar, so it spans every column instead of occupying column 1.
  // Both states must declare the same head row or the sheet visibly jumps when
  // the grid gains its timeslots column on date selection.
  month_view: {
    default: {
      width: "var(--booker-sheet-width)",
      minHeight: "450px",
      height: "auto",
      // Single column before a date is picked: the head band and the calendar
      // each span the whole sheet. The column COUNT here must match the number
      // of names per row in gridTemplateAreas, or the areas spill into an
      // implicit auto-width track and the head band stops spanning.
      gridTemplateAreas: `
      "meta"
      "main"
      `,
      gridTemplateColumns: "1fr",
      gridTemplateRows: "min-content 1fr",
    },
    selecting_time: {
      width: "var(--booker-sheet-width)",
      minHeight: "450px",
      height: "auto",
      gridTemplateAreas: `
      "meta meta"
      "main timeslots"
      `,
      gridTemplateColumns: "1fr var(--booker-timeslots-width)",
      gridTemplateRows: "min-content 1fr",
    },
  },
  week_view: {
    default: {
      width: "100vw",
      minHeight: "100vh",
      height: "auto",
      gridTemplateAreas: `
      "meta header header"
      "meta main main"
      `,
      gridTemplateColumns: "var(--booker-meta-width) 1fr",
      gridTemplateRows: "70px auto",
    },
  },
  column_view: {
    default: {
      width: "100vw",
      minHeight: "100vh",
      height: "auto",
      gridTemplateAreas: `
      "meta header header"
      "meta main main"
      `,
      gridTemplateColumns: "var(--booker-meta-width) 1fr",
      gridTemplateRows: "70px auto",
    },
  },
};

export const getBookerSizeClassNames = (
  layout: BookerLayout,
  bookerState: BookerState,
  hideEventTypeDetails = false
) => {
  const getBookerMetaClass = (className: string) => {
    if (hideEventTypeDetails) {
      return "";
    }
    return className;
  };

  return [
    // Size settings are abstracted on their own lines purely for readability.
    // General sizes, used always.
    // BROADSHEET: month_view widens the timeslot rail to 300px and sets the
    // overall sheet width; --booker-meta-width is left alone because week_view
    // and column_view still use it for their real meta sidebar.
    "[--booker-timeslots-width:240px] lg:[--booker-timeslots-width:280px]",
    layout === BookerLayouts.MONTH_VIEW &&
      "[--booker-timeslots-width:300px] lg:[--booker-timeslots-width:300px] [--booker-sheet-width:100%] xl:[--booker-sheet-width:1180px]",
    // Small calendar defaults
    // BROADSHEET: the head band spans the sheet, so meta is full width in
    // month_view. week_view/column_view keep their real 240-424px sidebar.
    layout === BookerLayouts.MONTH_VIEW && getBookerMetaClass("[--booker-meta-width:100%]"),
    // Meta column gets wider in booking view to fit the full date on a single row in case
    // of a multi occurrence event. Also makes form less wide, which also looks better.
    layout === BookerLayouts.MONTH_VIEW &&
      bookerState === "booking" &&
      `[--booker-main-width:420px] ${getBookerMetaClass("lg:[--booker-meta-width:100%]")}`,
    // Smaller meta when not in booking view.
    // BROADSHEET: the calendar column is fluid in month_view (it is the `1fr`
    // track), so the fixed 480px would pin the whole sheet narrow.
    layout === BookerLayouts.MONTH_VIEW &&
      bookerState !== "booking" &&
      `[--booker-main-width:100%] ${getBookerMetaClass("lg:[--booker-meta-width:100%]")}`,
    // Fullscreen view settings.
    layout !== BookerLayouts.MONTH_VIEW &&
      `[--booker-main-width:480px] [--booker-meta-width:340px] ${getBookerMetaClass(
        "lg:[--booker-meta-width:424px]"
      )}`,
  ];
};

/**
 * This hook returns a ref that should be set on the booker element.
 * Based on that ref this hook animates the size of the booker element with framer motion.
 * It also takes into account the prefers-reduced-motion setting, to not animate when that's set.
 */
export const useBookerResizeAnimation = (layout: BookerLayout, state: BookerState) => {
  const prefersReducedMotion = useReducedMotion();
  const [animationScope, animate] = useAnimate();
  const isEmbed = typeof window !== "undefined" && window?.isEmbed?.();
  ``;
  useEffect(() => {
    const animationConfig = resizeAnimationConfig[layout][state] || resizeAnimationConfig[layout].default;

    if (!animationScope.current) return;

    const animatedProperties = {
      height: animationConfig?.height || "auto",
    };

    const nonAnimatedProperties = {
      // Width is animated by the css class instead of via framer motion,
      // because css is better at animating the calcs, framer motion might
      // make some mistakes in that.
      gridTemplateAreas: animationConfig?.gridTemplateAreas,
      width: animationConfig?.width || "auto",
      gridTemplateColumns: animationConfig?.gridTemplateColumns,
      gridTemplateRows: animationConfig?.gridTemplateRows,
      minHeight: animationConfig?.minHeight,
    };

    // In this cases we don't animate the booker at all.
    if (prefersReducedMotion || layout === "mobile" || isEmbed) {
      const styles = { ...nonAnimatedProperties, ...animatedProperties };
      Object.keys(styles).forEach((property) => {
        if (property === "height") {
          // Change 100vh to 100% in embed, since 100vh in iframe will behave weird, because
          // the iframe will constantly grow. 100% will simply make sure it grows with the iframe.
          animationScope.current.style.height =
            animatedProperties.height === "100vh" && isEmbed ? "100%" : animatedProperties.height;
        } else {
          animationScope.current.style[property] = styles[property as keyof typeof styles];
        }
      });
    } else {
      Object.keys(nonAnimatedProperties).forEach((property) => {
        animationScope.current.style[property] =
          nonAnimatedProperties[property as keyof typeof nonAnimatedProperties];
      });
      animate(animationScope.current, animatedProperties, {
        duration: 0.5,
        ease: cubicBezier(0.4, 0, 0.2, 1),
      });
    }
  }, [animate, isEmbed, animationScope, layout, prefersReducedMotion, state]);

  return animationScope;
};

/**
 * These configures the amount of days that are shown on top of the selected date.
 */
export const extraDaysConfig = {
  mobile: {
    // Desktop tablet feels weird on mobile layout,
    // but this is simply here to make the types a lot easier..
    desktop: 0,
    tablet: 0,
  },
  [BookerLayouts.MONTH_VIEW]: {
    desktop: 0,
    tablet: 0,
  },
  [BookerLayouts.WEEK_VIEW]: {
    desktop: 7,
    tablet: 4,
  },
  [BookerLayouts.COLUMN_VIEW]: {
    desktop: 6,
    tablet: 2,
  },
};
